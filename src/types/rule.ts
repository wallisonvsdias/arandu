export interface Rule {
  id: string;
  name: string;
  selector: string;
  weightSeconds: number;
  enabled: boolean;
}

export interface PlatformConfig {
  platform: string;
  domain: string;
  rules: Rule[];
}