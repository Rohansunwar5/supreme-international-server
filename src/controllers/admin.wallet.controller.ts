import { NextFunction, Request, Response } from 'express';
import walletService from '../services/wallet.service';

export const creditHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { amount, reason } = req.body;
  const response = await walletService.adminCredit(req.params.id, Number(amount), reason, req.admin._id);
  next(response);
};

export const debitHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { amount, reason } = req.body;
  const response = await walletService.adminDebit(req.params.id, Number(amount), reason, req.admin._id);
  next(response);
};

export const getWalletHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await walletService.adminGetWallet(req.params.id);
  next(response);
};

export const getLedgerHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { page, limit } = req.query;
  const response = await walletService.adminGetLedger(req.params.id, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  next(response);
};
