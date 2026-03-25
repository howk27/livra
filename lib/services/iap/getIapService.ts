import { IapManager } from './IapManager';

export type IapService = typeof IapManager;

let iapServiceOverride: IapService | null = null;

export const getIapService = (): IapService => iapServiceOverride || IapManager;

export const setIapServiceOverride = (service: IapService | null): void => {
  iapServiceOverride = service;
};
