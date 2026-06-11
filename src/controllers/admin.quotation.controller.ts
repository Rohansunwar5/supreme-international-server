import { NextFunction, Request, Response } from 'express';
import quotationService from '../services/quotation.service';
import { QuotationStatus } from '../models/quotation.model';

export const listQuotations = async (req: Request, _res: Response, next: NextFunction) => {
  const { status, search, fromDate, toDate, page, limit } = req.query;
  const response = await quotationService.listQuotations({
    status: status as QuotationStatus | undefined,
    search: search as string | undefined,
    fromDate: fromDate as string | undefined,
    toDate: toDate as string | undefined,
    page: Number(page) || undefined,
    limit: Number(limit) || undefined,
  });
  next(response);
};

export const getQuotation = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.getQuotation(req.params.id);
  next(response);
};

export const updateQuotationStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.updateStatus(req.params.id, req.body.status);
  next(response);
};

export const quotationAnalytics = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.quotationAnalytics();
  next(response);
};
