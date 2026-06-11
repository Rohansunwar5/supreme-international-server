import mongoose from 'mongoose';

const PASSWORD_MIN_LENGTH = 8;

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 40,
    },
    lastName: {
      type: String,
      trim: true,
      maxLength: 40,
    },
    email: {
      type: String,
      required: true,
      minLength: 2,
    },
    img: {
      link: {
        type: String,
      },
      source: {
        type: String,
        enum: ['oauth', 'bucket'],
      },
    },
    password: {
      type: String,
      minLength: PASSWORD_MIN_LENGTH,
    },
    isdCode: {
      type: String,
      minLength: 2,
      maxLength: 10,
    },
    phoneNumber: {
      type: String,
      minLength: 5,
      maxLength: 40,
    },
    verificationCode: {
      type: String,
      required: true,
      minLength: 2,
    },
    verified: {
      type: Boolean,
      required: true,
      default: false,
    },
    authProvider: {
      type: String,
      default: 'email',
    },
    deletedAccount: {
      type: Boolean,
    },
    bio: {
      type: String,
    },
    location: {
      type: String,
    },
    socials: {
      twitter: {
        type: String,
      },
      github: {
        type: String,
      },
      facebook: {
        type: String,
      },
      instagram: {
        type: String,
      },
      linkedin: {
        type: String,
      }
    },
    company: {
      name: {
        type: String,
      },
      url: {
        type: String,
      }
    },
    accountType: {
      type: String,
      enum: ['individual', 'employee'],
      default: 'individual',
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    employeeStatus: {
      type: String,
      enum: ['invited', 'active', 'deactivated'],
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ verificationCode: 1 });

export interface IUser extends mongoose.Schema {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  img?: {
    link: string;
    source: string;
  };
  phoneNumber: string;
  isdCode: string;
  verified: boolean;
  password: string;
  authProvider: string;
  verificationCode: string;
  deletedAccount?: boolean;
  bio: string;
  location: string;
  socials?: {
    twitter?: string;
    github?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
  };
  company?: {
    name?: string;
    url?: string;
  }
  accountType: 'individual' | 'employee';
  companyId?: string;
  employeeStatus?: 'invited' | 'active' | 'deactivated';
}

export default mongoose.model<IUser>('User', userSchema);
