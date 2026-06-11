interface IWhatsappQuotationParams {
  adminNumber: string;
  quotationNumber: string;
  total: number;
  currency: string;
  pdfUrl: string;
}

export const buildQuotationWhatsappUrl = (p: IWhatsappQuotationParams): string => {
  const digits = p.adminNumber.replace(/\D/g, '');
  const message =
    `New quotation request ${p.quotationNumber}\n` +
    `Total: ${p.currency} ${p.total}\n` +
    `PDF: ${p.pdfUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
