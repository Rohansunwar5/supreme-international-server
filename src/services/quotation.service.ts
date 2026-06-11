import { customAlphabet } from 'nanoid';
import mongoose from 'mongoose';
import config from '../config';
import { BadRequestError } from '../errors/bad-request.error';
import { ConflictErrorJSON } from '../errors/conflict-custom.error';
import { NotFoundError } from '../errors/not-found.error';
import { ForbiddenError } from '../errors/forbidden.error';
import { QuotationRepository } from '../repository/quotation.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import cartService from './cart.service';
import pdfService from './pdf.service';
import { buildQuotationWhatsappUrl } from '../utils/whatsapp.util';
import { IQuotation, IQuotationItem, QuotationStatus } from '../models/quotation.model';

const genCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export interface IQuotationActorUser {
  _id: string;
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  isdCode?: string;
  company?: string;
}

export interface IGenerateQuotationParams {
  user: IQuotationActorUser;
  sessionId: string;
}

export interface IGenerateQuotationResult {
  quotationId: string;
  quotationNumber: string;
  pdfUrl: string;
  whatsappUrl: string;
}

class QuotationService {
  constructor(
    private readonly _quotationRepository: QuotationRepository,
    private readonly _variantRepository: ProductVariantRepository,
  ) {}

  async generateQuotation(params: IGenerateQuotationParams): Promise<IGenerateQuotationResult> {
    const { user, sessionId } = params;

    const cart = await cartService.getCart({ userId: user._id, sessionId });
    if (!cart.items.length) throw new BadRequestError('Cannot generate a quotation from an empty cart');

    const variantIds = cart.items.map(i => i.variantId);
    const liveVariants = await this._variantRepository.findByIds(variantIds);
    const liveMap = new Map(liveVariants.map(v => [v._id.toString(), v]));

    const moqViolations: Array<{ variantId: string; moq: number; qty: number }> = [];
    const inactive: string[] = [];

    for (const item of cart.items) {
      const live = liveMap.get(item.variantId);
      if (!live || !live.isActive) { inactive.push(item.variantId); continue; }
      if (item.qty < live.moq) moqViolations.push({ variantId: item.variantId, moq: live.moq, qty: item.qty });
    }

    if (inactive.length) {
      throw new BadRequestError(`Some items are no longer available: ${inactive.join(', ')}`);
    }
    if (moqViolations.length) {
      throw new ConflictErrorJSON(JSON.stringify({ code: 'MOQ_NOT_MET', violations: moqViolations }));
    }

    const items: IQuotationItem[] = cart.items.map(i => ({
      variantId: new mongoose.Types.ObjectId(i.variantId),
      productId: new mongoose.Types.ObjectId(i.productId),
      productName: i.productName,
      sku: i.sku,
      attributeLabels: i.attributeLabels,
      unitPrice: i.priceSnapshot,
      qty: i.qty,
      moq: liveMap.get(i.variantId)!.moq,
      lineTotal: i.priceSnapshot * i.qty,
    }));

    const quotationNumber = `QT-${new Date().getFullYear()}-${genCode()}`;
    const createdAt = new Date();
    const contact = {
      name: `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      isdCode: user.isdCode ?? '',
      company: user.company ?? '',
    };

    // 1) Render + upload PDF FIRST. If this throws, nothing is persisted.
    const pdfUrl = await pdfService.renderQuotationPdf({
      quotationNumber, createdAt, contact, items,
      subtotal: cart.subtotal,
      discountAmount: cart.coupon?.discountAmount ?? 0,
      couponCode: cart.coupon?.code ?? null,
      total: cart.total, currency: 'INR',
    });

    // 2) Persist only after a PDF URL exists.
    const doc: Partial<IQuotation> = {
      quotationNumber,
      user: new mongoose.Types.ObjectId(user._id),
      contact,
      items,
      subtotal: cart.subtotal,
      couponCode: cart.coupon?.code ?? null,
      discountAmount: cart.coupon?.discountAmount ?? 0,
      total: cart.total,
      currency: 'INR',
      pdfUrl,
      source: 'b2b',
    };
    const saved = await this._quotationRepository.create(doc);

    const whatsappUrl = buildQuotationWhatsappUrl({
      adminNumber: config.ADMIN_WHATSAPP_NUMBER,
      quotationNumber,
      total: cart.total,
      currency: 'INR',
      pdfUrl,
    });

    return { quotationId: saved._id.toString(), quotationNumber, pdfUrl, whatsappUrl };
  }

  async getMyQuotations(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this._quotationRepository.findByUser(userId, safePage, safeLimit),
      this._quotationRepository.countByUser(userId),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  async getQuotationPdf(quotationId: string, requesterId: string) {
    const q = await this._quotationRepository.findById(quotationId);
    if (!q) throw new NotFoundError('Quotation not found');
    if (q.user.toString() !== requesterId) throw new ForbiddenError('Not allowed to access this quotation');
    await this._quotationRepository.incrementDownload(quotationId);
    return { pdfUrl: q.pdfUrl, quotationNumber: q.quotationNumber };
  }

  // ---- admin ----
  async listQuotations(filter: {
    status?: QuotationStatus; search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filter.limit) || 20));
    return this._quotationRepository.list({
      status: filter.status,
      search: filter.search,
      fromDate: filter.fromDate ? new Date(filter.fromDate) : undefined,
      toDate: filter.toDate ? new Date(filter.toDate) : undefined,
      page, limit,
    });
  }

  async getQuotation(quotationId: string) {
    const q = await this._quotationRepository.findById(quotationId);
    if (!q) throw new NotFoundError('Quotation not found');
    return q;
  }

  async updateStatus(quotationId: string, status: QuotationStatus) {
    const allowed: QuotationStatus[] = ['generated', 'sent', 'viewed', 'converted', 'archived'];
    if (!allowed.includes(status)) throw new BadRequestError('Invalid quotation status');
    const updated = await this._quotationRepository.updateStatus(quotationId, status);
    if (!updated) throw new NotFoundError('Quotation not found');
    return updated;
  }

  async quotationAnalytics() {
    const [totalQuotations, totalDownloads, converted] = await Promise.all([
      this._quotationRepository.totalCount(),
      this._quotationRepository.sumDownloads(),
      this._quotationRepository.countByStatus('converted'),
    ]);
    return { totalQuotations, totalDownloads, converted };
  }
}

export default new QuotationService(new QuotationRepository(), new ProductVariantRepository());
