/**
 * Authorize.net createTransaction helper.
 * Field ORDER matters — see ffl-core ENGINEERING-NOTES.md.
 */

import type { ChargeInput, ChargeResult, PaymentProvider } from './payments';

type AuthNetConfig = {
  apiLoginId: string;
  transactionKey: string;
  sandbox: boolean;
  /** Overridable for tests; production default is 25s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 25_000;

export class AuthorizeNetProvider implements PaymentProvider {
  readonly name = 'authorize_net';

  constructor(private cfg: AuthNetConfig) {}

  private endpoint() {
    return this.cfg.sandbox
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const opaqueData = input.metadata?.opaqueDataDescriptor
      ? {
          dataDescriptor: input.metadata.opaqueDataDescriptor,
          dataValue: input.metadata.opaqueDataValue || '',
        }
      : null;

    const testCard = input.metadata?.testCardNumber;

    if (!opaqueData && !testCard) {
      return {
        success: false,
        provider: this.name,
        errorCode: 'missing_payment_method',
        errorMessage:
          'Authorize.net charge requires Accept.js opaque data or sandbox test card metadata',
      };
    }

    const amount = (input.amountCents / 100).toFixed(2);
    const payment = opaqueData
      ? { opaqueData }
      : {
          creditCard: {
            cardNumber: testCard,
            expirationDate: input.metadata?.testCardExp || '1228',
            cardCode: input.metadata?.testCardCvv || '123',
          },
        };

    const transactionRequest: Record<string, unknown> = {
      transactionType: 'authCaptureTransaction',
      amount,
      payment,
      order: {
        invoiceNumber: (input.metadata?.invoiceNumber || input.idempotencyKey).slice(0, 20),
        description: input.description.slice(0, 255),
      },
    };

    if (input.customerEmail) {
      transactionRequest.customer = { email: input.customerEmail };
    }

    if (input.billTo) {
      const phone = input.billTo.phoneNumber
        ? input.billTo.phoneNumber.replace(/[^0-9]/g, '')
        : '';
      const billTo: Record<string, string> = {
        firstName: input.billTo.firstName || 'Customer',
        lastName: input.billTo.lastName || 'Customer',
      };
      if (input.billTo.address) billTo.address = input.billTo.address;
      if (input.billTo.city) billTo.city = input.billTo.city;
      if (input.billTo.state) billTo.state = input.billTo.state;
      if (input.billTo.zip) billTo.zip = input.billTo.zip;
      billTo.country = input.billTo.country || 'US';
      if (phone.length >= 7) billTo.phoneNumber = phone;
      transactionRequest.billTo = billTo;
    }

    if (input.customerIp) {
      transactionRequest.customerIP = input.customerIp;
    }

    const body = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: this.cfg.apiLoginId,
          transactionKey: this.cfg.transactionKey,
        },
        refId: input.idempotencyKey.slice(0, 20),
        transactionRequest,
      },
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const json = JSON.parse(text.replace(/^\uFEFF/, ''));
      const messages = json?.messages;
      const tr = json?.transactionResponse;

      if (messages?.resultCode !== 'Ok' || !tr || tr.responseCode !== '1') {
        const errText =
          tr?.errors?.[0]?.errorText ||
          messages?.message?.[0]?.text ||
          'Transaction declined';
        return {
          success: false,
          provider: this.name,
          errorCode: tr?.errors?.[0]?.errorCode || 'declined',
          errorMessage: errText,
          raw: json,
        };
      }

      return {
        success: true,
        provider: this.name,
        transactionId: tr.transId,
        authCode: tr.authCode,
        raw: json,
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return {
          success: false,
          provider: this.name,
          errorCode: 'timeout',
          errorMessage: 'Authorize.net did not respond in time',
        };
      }
      return {
        success: false,
        provider: this.name,
        errorCode: 'network',
        errorMessage: e instanceof Error ? e.message : 'AuthNet request failed',
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
