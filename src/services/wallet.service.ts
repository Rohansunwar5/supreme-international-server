import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { WalletRepository } from '../repository/wallet.repository';
import { WalletLedgerRepository } from '../repository/walletLedger.repository';
import { UserRepository } from '../repository/user.repository';

type LedgerSource = 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';

class WalletService {
  constructor(
    private readonly _walletRepository: WalletRepository,
    private readonly _ledgerRepository: WalletLedgerRepository,
    private readonly _userRepository: UserRepository,
  ) {}

  async credit(
    employeeId: string,
    companyId: string,
    amount: number,
    reason: string,
    adminId?: string,
    opts?: { source?: LedgerSource; referenceId?: string },
  ) {
    const wallet = await this._walletRepository.getOrCreate(employeeId, companyId);
    const updated = await this._walletRepository.atomicCredit(wallet._id.toString(), amount);
    if (!updated) throw new BadRequestError('Failed to credit wallet');

    await this._ledgerRepository.create({
      walletId: wallet._id.toString(),
      employeeId,
      companyId,
      type: 'credit',
      amount,
      balanceAfter: updated.balance,
      reason,
      source: opts?.source ?? 'admin_topup',
      createdBy: adminId,
      referenceId: opts?.referenceId,
    });

    return { balance: updated.balance, currency: updated.currency };
  }

  async debit(
    employeeId: string,
    companyId: string,
    amount: number,
    reason: string,
    adminId?: string,
    opts?: { source?: LedgerSource; referenceId?: string },
  ) {
    const wallet = await this._walletRepository.getOrCreate(employeeId, companyId);
    const updated = await this._walletRepository.atomicDebit(wallet._id.toString(), amount);
    if (!updated) throw new BadRequestError('INSUFFICIENT_BALANCE');

    await this._ledgerRepository.create({
      walletId: wallet._id.toString(),
      employeeId,
      companyId,
      type: 'debit',
      amount,
      balanceAfter: updated.balance,
      reason,
      source: opts?.source ?? 'admin_adjustment',
      createdBy: adminId,
      referenceId: opts?.referenceId,
    });

    return { balance: updated.balance, currency: updated.currency };
  }

  async getWallet(employeeId: string) {
    const wallet = await this._walletRepository.findByEmployeeId(employeeId);
    if (!wallet) return { balance: 0, currency: 'INR' };
    return { balance: wallet.balance, currency: wallet.currency };
  }

  async getLedger(employeeId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const wallet = await this._walletRepository.findByEmployeeId(employeeId);
    if (!wallet) return { items: [], pagination: { total: 0, page: safePage, limit: safeLimit, pages: 0 } };

    const { items, total } = await this._ledgerRepository.findByWallet(wallet._id.toString(), safePage, safeLimit);
    return { items, pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  async adminCredit(employeeId: string, amount: number, reason: string, adminId: string) {
    const employee = await this._resolveEmployee(employeeId);
    return this.credit(employeeId, employee.companyId as string, amount, reason, adminId);
  }

  async adminDebit(employeeId: string, amount: number, reason: string, adminId: string) {
    const employee = await this._resolveEmployee(employeeId);
    return this.debit(employeeId, employee.companyId as string, amount, reason, adminId);
  }

  async adminGetWallet(employeeId: string) {
    await this._resolveEmployee(employeeId);
    return this.getWallet(employeeId);
  }

  async adminGetLedger(employeeId: string, page?: number, limit?: number) {
    await this._resolveEmployee(employeeId);
    return this.getLedger(employeeId, page, limit);
  }

  private async _resolveEmployee(employeeId: string) {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }
}

export default new WalletService(new WalletRepository(), new WalletLedgerRepository(), new UserRepository());
