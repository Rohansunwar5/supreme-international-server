import { NextFunction, Request, Response } from 'express';
import walletService from '../services/wallet.service';

export const getMyWallet = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await walletService.getWallet(req.user._id);
  next(response);
};

export const getMyLedger = async (req: Request, _res: Response, next: NextFunction) => {
  const { page, limit } = req.query;
  const response = await walletService.getLedger(req.user._id, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  next(response);
};
