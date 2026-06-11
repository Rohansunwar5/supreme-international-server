/* eslint-disable @typescript-eslint/no-non-null-assertion */
import dotenv from 'dotenv';
dotenv.config();

const config = {
  MONGO_URI: process.env.MONGO_URI! as string,
  NODE_ENV: process.env.NODE_ENV! as string,
  REDIS_HOST: process.env.REDIS_HOST! as string,
  REDIS_PORT: process.env.REDIS_PORT! as string,
  PORT: process.env.PORT! as string,
  JWT_SECRET: process.env.JWT_SECRET! as string,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY! as string,
  CLOUDWATCH_LOG_GROUP_NAME: process.env.CLOUDWATCH_LOG_GROUP_NAME! as string,
  CLOUDWATCH_LOGS_ID: process.env.CLOUDWATCH_LOGS_ID! as string,
  CLOUDWATCH_LOGS_SECRET: process.env.CLOUDWATCH_LOGS_SECRET! as string,
  CLOUDWATCH_LOGS_REGION: process.env.CLOUDWATCH_LOGS_REGION! as string,

  SERVER_NAME: `${process.env.SERVER_NAME}-${process.env.NODE_ENV}`! as string,
  AWS_REGION: process.env.AWS_REGION! as string,
  AWS_ACCESS_ID: process.env.AWS_ACCESS_ID! as string,
  AWS_SECRET: process.env.AWS_SECRET! as string,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID! as string,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET! as string,
  NOTIFY_TO: process.env.NOTIFY_TO! as string,
  JWT_CACHE_ENCRYPTION_KEY: process.env.JWT_CACHE_ENCRYPTION_KEY! as string,
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET! as string,
  DEFAULT_COUNTRY_CODE: 'IN',

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID! as string,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID! as string,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY! as string,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME! as string,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL! as string,

  LOW_STOCK_THRESHOLD: Number(process.env.LOW_STOCK_THRESHOLD) || 10,
  GUEST_CART_TTL_SECONDS: Number(process.env.GUEST_CART_TTL_SECONDS) || 604800,
  MAX_CART_QTY_PER_ITEM: Number(process.env.MAX_CART_QTY_PER_ITEM) || 9999,

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID! as string,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET! as string,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET! as string,

  FREE_SHIPPING_THRESHOLD: Number(process.env.FREE_SHIPPING_THRESHOLD) || 20000,
  STANDARD_SHIPPING_CHARGE: Number(process.env.STANDARD_SHIPPING_CHARGE) || 499,
  SHIPPING_TAX_RATE: 0.18,

  ADMIN_WHATSAPP_NUMBER: process.env.ADMIN_WHATSAPP_NUMBER! as string,
};

export default config;