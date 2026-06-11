import { NextFunction, Request, Response } from 'express';
import companyService from '../services/company.service';

export const createCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, primaryContact, notes } = req.body;
  const response = await companyService.createCompany({ name, primaryContact, notes, createdBy: req.admin._id });
  next(response);
};

export const listCompaniesHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { status, search, page, limit } = req.query;
  const response = await companyService.listCompanies({
    status: status as 'active' | 'inactive' | undefined,
    search: search as string | undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  next(response);
};

export const getCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.getCompany(req.params.id);
  next(response);
};

export const updateCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, status, primaryContact, notes } = req.body;
  const response = await companyService.updateCompany(req.params.id, { name, status, primaryContact, notes });
  next(response);
};

export const inviteEmployeeHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { firstName, lastName, isdCode, phoneNumber, email } = req.body;
  const response = await companyService.inviteEmployee(req.params.id, { firstName, lastName, isdCode, phoneNumber, email });
  next(response);
};

export const listEmployeesHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.listEmployees(req.params.id, req.query.status as string | undefined);
  next(response);
};

export const resendInviteHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.resendInvite(req.params.id);
  next(response);
};

export const updateEmployeeStatusHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.setEmployeeStatus(req.params.id, req.body.status);
  next(response);
};
