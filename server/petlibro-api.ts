/**
 * Petlibro API Client
 * Handles authentication and data fetching from the Petlibro cloud API.
 * Based on the jjjonesjr33/petlibro Home Assistant integration.
 */
import axios, { AxiosInstance } from "axios";
import { createHash } from "crypto";

const REGIONS: Record<string, string> = {
  US: "https://api.us.petlibro.com",
  EU: "https://api.eu.petlibro.com",
  AP: "https://api.ap.petlibro.com",
  CN: "https://api.cn.petlibro.com",
};

const APP_ID = 1;
const APP_SN = "c35772530d1041699c87fe62348507a8";

function hashPassword(password: string): string {
  return createHash("md5").update(password, "utf-8").digest("hex");
}

export interface PetlibroDevice {
  deviceSn: string;
  productName: string;
  productIdentifier: string;
  name: string;
  mac: string;
  online: boolean;
  softwareVersion: string;
  hardwareVersion: string;
}

export interface DrinkWaterData {
  todayTotalMl: number;
  todayTotalTimes: number;
  petEatingTime: number;
  avgDrinkDuration: number;
  yesterdayTotalMl: number;
  yesterdayTotalTimes: number;
}

export interface DeviceRealInfo {
  deviceSn: string;
  wifiSsid: string;
  wifiRssi: number;
  online: boolean;
  weight: number;
  weightPercent: number;
  remainingReplacementDays: number;
  remainingCleaningDays: number;
  lightSwitch: boolean;
  soundSwitch: boolean;
  filterReplacementFrequency: number;
  machineCleaningFrequency: number;
  waterStopSwitch: boolean;
  powerType: number;
}

export interface FountainStatus {
  online: boolean;
  weightPercent: number;
  remainingFilterDays: number;
  remainingCleaningDays: number;
  filterReplacementFrequency: number;
  machineCleaningFrequency: number;
  wifiRssi: number;
  waterState: boolean;
}

export interface WorkRecord {
  id?: string;
  deviceSn?: string;
  type?: string;
  content?: string;
  startTime?: number;
  endTime?: number;
  createTime?: string;
  timestamp?: number;
  [key: string]: any;
}

export interface DeviceEvent {
  eventId?: string;
  eventType?: string;
  eventName?: string;
  content?: string;
  deviceSn?: string;
  createTime?: string;
  timestamp?: number;
  [key: string]: any;
}

export class PetlibroAPI {
  private client: AxiosInstance;
  private token: string | null = null;
  private region: string;
  private email: string;
  private password: string;
  private timezone: string;

  constructor(email: string, password: string, region: string = "US", timezone: string = "America/New_York") {
    this.email = email;
    this.password = password;
    this.region = region.toUpperCase();
    this.timezone = timezone;

    const baseURL = REGIONS[this.region] || REGIONS.US;

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "source": "ANDROID",
        "language": "EN",
        "timezone": this.timezone,
        "version": "1.3.45",
      },
    });
  }

  async login(): Promise<boolean> {
    try {
      const response = await this.client.post("/member/auth/login", {
        appId: APP_ID,
        appSn: APP_SN,
        country: this.region,
        email: this.email,
        password: hashPassword(this.password),
        phoneBrand: "",
        phoneSystemVersion: "",
        timezone: this.timezone,
        thirdId: null,
        type: null,
      });

      const data = response.data;

      if (data?.data?.token) {
        this.token = data.data.token;
        this.client.defaults.headers.common["token"] = this.token;
        return true;
      }

      if (data?.code === 0 && data?.token) {
        this.token = data.token;
        this.client.defaults.headers.common["token"] = this.token;
        return true;
      }

      console.error("[PetlibroAPI] Login failed:", data?.msg || "no token in response");
      return false;
    } catch (error: any) {
      console.error("[PetlibroAPI] Login error:", error?.response?.data || error.message);
      return false;
    }
  }

  private async ensureAuth(): Promise<void> {
    if (!this.token) {
      const success = await this.login();
      if (!success) {
        throw new Error("Failed to authenticate with Petlibro API");
      }
    }
  }

  private async post(endpoint: string, data: any = {}): Promise<any> {
    await this.ensureAuth();
    try {
      const response = await this.client.post(endpoint, data);
      const respData = response.data;

      // Handle token expiration (code 1009 = NOT_YET_LOGIN)
      if (respData?.code === 1009 || respData?.code === 401) {
        console.log(`[PetlibroAPI] Token expired (code ${respData.code}) on ${endpoint}, refreshing...`);
        this.token = null;
        const refreshed = await this.login();
        if (!refreshed) {
          throw new Error("Token refresh failed - could not re-authenticate");
        }
        const retryResponse = await this.client.post(endpoint, data);
        const retryData = retryResponse.data;
        if (retryData?.code !== 0 && retryData?.code !== undefined) {
          console.error(`[PetlibroAPI] Retry failed on ${endpoint}:`, retryData?.msg);
          return null;
        }
        return retryData?.data || retryData;
      }

      if (respData?.code !== 0 && respData?.code !== undefined) {
        console.error(`[PetlibroAPI] API error on ${endpoint}:`, respData?.msg);
        return null;
      }

      return respData?.data || respData;
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.data?.code === 1009) {
        console.log(`[PetlibroAPI] HTTP 401 on ${endpoint}, refreshing token...`);
        this.token = null;
        const refreshed = await this.login();
        if (!refreshed) {
          throw new Error("Token refresh failed - could not re-authenticate");
        }
        const retryResponse = await this.client.post(endpoint, data);
        return retryResponse.data?.data || retryResponse.data;
      }
      throw error;
    }
  }

  async listDevices(): Promise<PetlibroDevice[]> {
    try {
      const data = await this.post("/device/device/list", {});
      if (Array.isArray(data)) return data;
      if (data?.list) return data.list;
      if (data?.devices) return data.devices;
      return [];
    } catch (error: any) {
      console.error("[PetlibroAPI] listDevices error:", error.message);
      return [];
    }
  }

  async getDeviceRealInfo(deviceSn: string): Promise<DeviceRealInfo | null> {
    try {
      const data = await this.post("/device/device/realInfo", {
        id: deviceSn,
        deviceSn,
      });
      return data || null;
    } catch (error: any) {
      console.error("[PetlibroAPI] getDeviceRealInfo error:", error.message);
      return null;
    }
  }

  async getDrinkWaterData(deviceSn: string): Promise<DrinkWaterData | null> {
    try {
      const data = await this.post("/data/deviceDrinkWater/todayDrinkData", {
        id: deviceSn,
        deviceSn,
      });
      return data || null;
    } catch (error: any) {
      console.error("[PetlibroAPI] getDrinkWaterData error:", error.message);
      return null;
    }
  }

  async getDeviceEvents(deviceSn: string): Promise<DeviceEvent[]> {
    try {
      const data = await this.post("/data/event/deviceEventsV2", {
        id: deviceSn,
        deviceSn,
      });
      // The API may return an array directly or nested in a list property
      if (Array.isArray(data)) return data;
      if (data?.list && Array.isArray(data.list)) return data.list;
      if (data?.events && Array.isArray(data.events)) return data.events;
      return [];
    } catch (error: any) {
      console.error("[PetlibroAPI] getDeviceEvents error:", error.message);
      return [];
    }
  }

  async getWorkRecords(deviceSn: string, startTime: number, endTime: number, types?: string[]): Promise<WorkRecord[]> {
    try {
      const payload: any = {
        deviceSn,
        startTime,
        endTime,
        size: 100,
      };
      if (types && types.length > 0) {
        payload.type = types;
      }
      const data = await this.post("/device/workRecord/list", payload);
      console.log("[PetlibroAPI] workRecord raw response:", JSON.stringify(data)?.substring(0, 500));
      if (Array.isArray(data)) return data;
      if (data?.list && Array.isArray(data.list)) return data.list;
      if (data?.records && Array.isArray(data.records)) return data.records;
      if (data?.data && Array.isArray(data.data)) return data.data;
      // If it's an object with pagination, try to extract the list
      if (data && typeof data === 'object') {
        // Log all keys to help debug the response structure
        console.log("[PetlibroAPI] workRecord response keys:", Object.keys(data));
      }
      return [];
    } catch (error: any) {
      console.error("[PetlibroAPI] getWorkRecords error:", error.message);
      return [];
    }
  }

  async getFountainStatus(deviceSn: string): Promise<FountainStatus | null> {
    try {
      const realInfo = await this.getDeviceRealInfo(deviceSn);
      if (!realInfo) return null;

      return {
        online: realInfo.online ?? false,
        weightPercent: realInfo.weightPercent ?? 0,
        remainingFilterDays: realInfo.remainingReplacementDays ?? 0,
        remainingCleaningDays: realInfo.remainingCleaningDays ?? 0,
        filterReplacementFrequency: realInfo.filterReplacementFrequency ?? 30,
        machineCleaningFrequency: realInfo.machineCleaningFrequency ?? 7,
        wifiRssi: realInfo.wifiRssi ?? -100,
        waterState: !realInfo.waterStopSwitch,
      };
    } catch (error: any) {
      console.error("[PetlibroAPI] getFountainStatus error:", error.message);
      return null;
    }
  }

  async testConnection(): Promise<{ success: boolean; devices: PetlibroDevice[]; error?: string }> {
    try {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, devices: [], error: "Authentication failed. Check your email, password, and region." };
      }
      const devices = await this.listDevices();
      return { success: true, devices };
    } catch (error: any) {
      return { success: false, devices: [], error: error.message || "Connection failed" };
    }
  }
}

// Cache API instances per user to avoid repeated logins
const apiCache = new Map<string, { api: PetlibroAPI; expiresAt: number }>();

export function getOrCreateAPI(email: string, password: string, region: string): PetlibroAPI {
  const key = `${email}:${region}`;
  const cached = apiCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.api;
  }

  const api = new PetlibroAPI(email, password, region);
  apiCache.set(key, { api, expiresAt: now + 30 * 60 * 1000 }); // 30 min cache
  return api;
}
