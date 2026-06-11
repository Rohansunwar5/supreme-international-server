declare namespace Express {
  export interface Request {
    user: {
      _id: string,
    },
    admin: {
      _id: string,
    },
    sessionId: string,
    companyId?: string,
    access_token: string | null,
    rawBody?: Buffer,
  }
}
