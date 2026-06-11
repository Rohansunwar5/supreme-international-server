import UserModel from '../../models/user.model';

describe('User model employee fields', () => {
  it('defaults accountType to individual', () => {
    const u = new UserModel({ firstName: 'A', email: 'a@x.com', verificationCode: 'xx' });
    expect(u.accountType).toBe('individual');
  });

  it('accepts employee fields', () => {
    const u = new UserModel({
      firstName: 'E', email: 'e@x.com', verificationCode: 'xx',
      accountType: 'employee', companyId: '64b8f0000000000000000001', employeeStatus: 'invited',
    });
    expect(u.accountType).toBe('employee');
    expect(u.employeeStatus).toBe('invited');
    expect(u.validateSync()).toBeUndefined();
  });

  it('rejects an invalid employeeStatus', () => {
    const u = new UserModel({
      firstName: 'E', email: 'e@x.com', verificationCode: 'xx',
      accountType: 'employee', employeeStatus: 'bogus',
    });
    expect(u.validateSync()?.errors?.employeeStatus).toBeDefined();
  });
});
