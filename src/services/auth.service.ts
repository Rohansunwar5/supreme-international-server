import config from '../config';
import { BadRequestError } from '../errors/bad-request.error';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UserRepository } from '../repository/user.repository';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { sha1 } from '../utils/hash.util';
import mailService from './mail.service';
import { OAuth2Client } from 'google-auth-library';
import { encode, encryptionKey } from './crypto.service';
import { encodedJWTCacheManager, otpDeleteAccountCacheManager, profileCacheManager } from './cache/entities';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 16);
const numericNanoid = customAlphabet('0123456789', 6);
const googleAuthClient = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, 'postmessage');

class AuthService {
  constructor(private readonly _userRepository: UserRepository) {
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async login(params: { email: string, password: string }) {
    const { email, password } = params;
    const user = await this._userRepository.getUserByEmailId(email);
    if (!user) throw new NotFoundError('User not found');
    if (!user.password) throw new BadRequestError('Reset password');

    // check if password is valid;
    const success = await this.verifyHashPassword(password, user.password);
    if (!success) throw new UnauthorizedError('Invalid Email or Password');

    // generate JWT token;
    const accessToken = await this.generateJWTToken(user._id);
    if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

    return { accessToken };
  }

  async verifyHashPassword(plainTextPassword: string, hashedPassword: string) {
    return await bcrypt.compare(plainTextPassword, hashedPassword);
  }

  async hashPassword(plainTextPassword: string) {
    return await bcrypt.hash(plainTextPassword, 10);
  }

  async generateJWTToken(userId: string) {
    const token = jwt.sign({
      _id: userId.toString(),
    }, config.JWT_SECRET, { expiresIn: '24h' });

    const key = await encryptionKey(config.JWT_CACHE_ENCRYPTION_KEY);
    const encryptedData = await encode(token, key);
    await encodedJWTCacheManager.set({ userId }, encryptedData);

    return token;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  async signup(params: any) {
    const { firstName, lastName, isdCode, phoneNumber, email, password } = params;
    const existingUser = await this._userRepository.getUserByEmailId(email);

    if (existingUser) throw new BadRequestError('Email address already exists');

    // get hashedPassword
    const hashedPassword = await this.hashPassword(password);
    const verificationCode = nanoid();
    // send this verificationCode via email to verify.
    const user = await this._userRepository.onBoardUser({
      firstName, lastName, isdCode, phoneNumber, email, password: hashedPassword, verificationCode: sha1(verificationCode), img: {
        link: 'default-profile.png',
        source: 'bucket'
      }
    });
    if (!user) throw new InternalServerError('Failed to Onboard user');

    mailService.sendEmail(email, 'verification.ejs', { verificationCode }, 'Verify Your Email Address to Get Started! - WorkPlay Studio Pvt Ltd.').catch(() => {});

    // generate JWT Token
    const accessToken = await this.generateJWTToken(user._id);
    if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

    return { accessToken };
  }

  async profile(userId: string) {
    const cached = await profileCacheManager.get({ userId });
    if (!cached) {
      const user = await this._userRepository.getUserById(userId);
      if (!user) throw new NotFoundError('User not found');

      // set cache;
      await profileCacheManager.set({ userId }, user);
      return user;
    }
    return cached;
  }

  async updateProfile(params: {
    firstName: string, lastName: string, isdCode?: string, phoneNumber?: string, _id: string, bio?: string, location?: string, company?: { name?: string, url?: string }, socials?: {
      twitter?: string,
      github?: string,
      facebook?: string,
      instagram?: string,
      linkedin?: string,
    }
  }) {
    const { firstName, lastName, isdCode, phoneNumber, _id, bio, location, socials, company } = params;
    const user = await this._userRepository.updateUser({ firstName, lastName, isdCode, phoneNumber, _id, bio, location, socials, company });
    if (!user) throw new NotFoundError('User not found');

    return user;
  }

  async resendVerificationLink(userId: string) {
    const userExists = await this._userRepository.getUserById(userId);
    if (userExists?.verified) throw new BadRequestError('Email already verified');

    const verificationCode = nanoid();
    const user = await this._userRepository.updateVerificationCode(userId, sha1(verificationCode));
    if (!user) throw new InternalServerError('Failed to generate verification code');

    // send email with newVerificationCode;
    mailService.sendEmail(user.email, 'verification.ejs', { verificationCode }, 'Verify Your Email Address to Get Started! - WorkPlay Studio Pvt Ltd.').catch(() => {});

    return true;
  }

  async verifyEmail(code: string) {
    const user = await this._userRepository.verifyUser(code);
    if (!user) throw new BadRequestError('Invalid Code');

    const newVerificationCode = nanoid();
    await this._userRepository.updateVerificationCode(user.id, sha1(newVerificationCode));

    return true;
  }

  async generateResetPasswordLink(email: string) {
    const userExists = await this._userRepository.getUserByEmailId(email);
    if (!userExists) throw new NotFoundError('User not found');

    const verificationCode = nanoid();
    const user = await this._userRepository.updateVerificationCode(userExists._id, sha1(verificationCode));
    if (!user) throw new InternalServerError('Failed to generate verification code');

    // send mail
    mailService.sendEmail(user.email, 'reset-password.ejs', { verificationCode, firstName: user.firstName }, 'Reset Your Password: Regain Access to Your Account! - WorkPlay Studio Pvt Ltd.').catch(() => {});

    return true;
  }

  async verifyResetPasswordCode(code: string) {
    const user = await this._userRepository.getUserWithVerificationCode(code);
    if (!user) throw new BadRequestError('Invalid code');

    return true;
  }

  async resetPassword(code: string, password: string) {
    const user = await this._userRepository.getUserWithVerificationCode(code);
    if (!user) throw new BadRequestError('Invalid code');

    const hashedPassword = await this.hashPassword(password);
    const passwordUpdated = await this._userRepository.resetPassword(code, hashedPassword);
    if (!passwordUpdated) throw new InternalServerError('Failed to reset password');

    // generate new code after resetting password
    const newVerificationCode = nanoid();
    await this._userRepository.updateVerificationCode(user.id, sha1(newVerificationCode));

    // send mail
    mailService.sendEmail(user.email, 'reset-password-success.ejs', { firstName: user.firstName }, 'Password Reset Successfull: Login Now! - WorkPlay Studio Pvt Ltd.').catch(() => {});

    return true;
  }

  async googleOAuthHandler(token: string) {
    return new Promise(async (resolve, reject) => {
      googleAuthClient
        .verifyIdToken({
          idToken: token,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (resp: any) => {
          const {
            email_verified,
            family_name,
            given_name,
            email,
            picture: imgURL,
          } = resp['payload'];
          resolve({
            email_verified,
            family_name,
            given_name,
            email,
            picture: imgURL,
          });
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => {
          reject(err);
        });
    });
  }

  async ssoLogin(params: { family_name: string; given_name: string, email: string, img: { link: string, source: string } }) {
    const { family_name, given_name, email, img } = params;

    const userExists = await this._userRepository.getUserByEmailId(email);
    if (!userExists) {
      // create new user;
      const verificationCode = nanoid();
      // send this verificationCode via email to verify.
      const user = await this._userRepository.onBoardUser({
        firstName: given_name, lastName: family_name, email, verificationCode: sha1(verificationCode), verified: true, img
      });
      if (!user) throw new InternalServerError('Failed to Onboard user');

      return user._id;
    }

    if (!userExists.verified) {
      const user = await this._userRepository.verifyUserId(userExists._id);
      if (!user) throw new InternalServerError('Failed to verify user');
    }

    return userExists._id;
  }

  async sso(code: string) {
    try {
      const { tokens } = await googleAuthClient.getToken(code);
      if (!tokens.id_token) throw new BadRequestError('Code Invalid or Expired');

      const { family_name, given_name, email, picture } = await this.googleOAuthHandler(tokens.id_token) as { family_name: string; given_name: string, email: string, picture: string };

      // signup if user-email doesnt exist in the platform
      const userId = await this.ssoLogin({ family_name, given_name, email, img: { link: picture, source: 'oauth' } });
      if (!userId) throw new UnauthorizedError('Code Invalid or Expired');

      // generate JWT Token
      const accessToken = await this.generateJWTToken(userId);
      if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

      return { accessToken };
    } catch (error) {
      throw new BadRequestError('Code Invalid or Expired');
    }
  }

  async updateProfileImage(userId: string, fileName: string) {
    const updatedProfile = await this._userRepository.updateUserProfileImage(userId, fileName);
    if (!updatedProfile) throw new InternalServerError('Failed to update profile image');

    return true;
  }

  async generateAccountDeletionCode(userId: string) {
    const user = await this._userRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User not found');

    const code = numericNanoid();
    await otpDeleteAccountCacheManager.set({ userId }, { code });

    mailService.sendEmail(user.email, 'delete-account.ejs', { firstName: user.firstName, code }, 'Here\'s Account Deletion Secure Code');
    return true;
  }

  async deleteAccount(code: string, userId: string) {
    const storedOTP = await otpDeleteAccountCacheManager.get({ userId });
    if (storedOTP?.code !== code) {
      throw new BadRequestError('Invalid OTP');
    }

    const updatedProfile = await this._userRepository.deleteAccount(userId);
    if (!updatedProfile) throw new InternalServerError('Failed to delete account');

    // set new token in place of existing in cache
    await this.generateJWTToken(userId);

    return true;
  }

}

export default new AuthService(new UserRepository());