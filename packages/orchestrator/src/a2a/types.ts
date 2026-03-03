export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: A2ASkill[];
  securitySchemes: A2ASecurityScheme[];
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface A2ASecurityScheme {
  type: string;
  scheme: string;
  description: string;
}

export interface A2AServerConfig {
  agentName?: string;
  publicUrl: string;
  port?: number;
}
