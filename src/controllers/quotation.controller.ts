import { NextFunction, Request, Response } from 'express';
import quotationService from '../services/quotation.service';
import { UserRepository } from '../repository/user.repository';

const userRepository = new UserRepository();

export const generateQuotation = async (req: Request, _res: Response, next: NextFunction) => {
  const user = await userRepository.getUserById(req.user._id);
  const response = await quotationService.generateQuotation({
    user: {
      _id: req.user._id,
      firstName: user!.firstName,
      lastName: user!.lastName,
      email: user!.email,
      phoneNumber: user!.phoneNumber,
      isdCode: user!.isdCode,
    },
    sessionId: req.sessionId,
  });
  next(response);
};

export const getMyQuotations = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const response = await quotationService.getMyQuotations(req.user._id, page, limit);
  next(response);
};

export const downloadQuotationPdf = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.getQuotationPdf(req.params.id, req.user._id);
  next(response);
};
