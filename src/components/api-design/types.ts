// API Design Types

export interface APIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema: SchemaObject;
}

export interface SchemaObject {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  description?: string;
  example?: any;
  default?: any;
  enum?: string[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  $ref?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface RequestBody {
  description?: string;
  required: boolean;
  content: {
    'application/json'?: {
      schema: SchemaObject;
      example?: any;
    };
  };
}

export interface ResponseObject {
  description: string;
  content?: {
    'application/json'?: {
      schema: SchemaObject;
      example?: any;
    };
  };
}

export interface APIEndpoint {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  summary: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: APIParameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
  security?: any[];
  // Test case related fields
  testCases?: GeneratedTestCase[];
  isSelected?: boolean;
}

export interface GeneratedTestCase {
  id: string;
  name: string;
  description: string;
  type: 'positive' | 'negative' | 'edge' | 'security';
  priority: 'High' | 'Medium' | 'Low';
  method: string;
  endpoint: string;
  parameters?: Record<string, any>;
  headers?: Record<string, string>;
  body?: any;
  expectedStatus: number;
  expectedResponse?: any;
  assertions: TestAssertion[];
  // Execution results
  lastExecution?: TestExecutionResult;
  executionHistory?: TestExecutionResult[];
}

export interface TestAssertion {
  type: 'status_code' | 'response_body' | 'response_header' | 'response_time' | 'json_path';
  condition: 'equals' | 'contains' | 'not_equals' | 'greater_than' | 'less_than' | 'exists' | 'not_exists';
  path?: string; // For JSON path assertions
  value: string;
  description: string;
}

export interface TestExecutionResult {
  timestamp: string;
  status: 'passed' | 'failed' | 'error';
  responseStatus: number;
  responseTime: number;
  responseData?: any;
  responseHeaders?: Record<string, string>;
  assertionResults: AssertionResult[];
  error?: string;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actualValue?: any;
  message?: string;
}

export interface APIFlowStep {
  id: string;
  endpointId: string;
  testCaseId: string;
  order: number;
  // Variable extraction from response
  extractVariables?: VariableExtraction[];
  // Variable injection into request
  injectVariables?: VariableInjection[];
}

export interface VariableExtraction {
  variableName: string;
  source: 'response_body' | 'response_header';
  jsonPath?: string; // e.g., "$.data.id"
  headerName?: string;
}

export interface VariableInjection {
  variableName: string;
  target: 'path' | 'query' | 'header' | 'body';
  path?: string; // JSONPath for body injection
  paramName?: string; // For path/query/header
}

export interface FlowStepResult {
  stepId: string;
  stepOrder: number;
  endpointPath: string;
  method: string;
  testCaseName: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  responseStatus: number;
  responseTime: number;
  responseData?: any;
  extractedVariables?: Record<string, any>;
  error?: string;
}

export interface FlowExecutionResult {
  id: string;
  flowId: string;
  flowName: string;
  timestamp: string;
  status: 'passed' | 'failed' | 'error';
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDuration: number;
  stepResults: FlowStepResult[];
}

export interface APIFlow {
  id: string;
  name: string;
  description?: string;
  steps: APIFlowStep[];
  createdAt: string;
  updatedAt: string;
  lastExecution?: FlowExecutionResult;
}

export interface SchemaRef {
  name: string;
  schema: SchemaObject;
}

export interface APISpecification {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, any>;
  };
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
export const PARAMETER_LOCATIONS = ['query', 'path', 'header', 'cookie'] as const;
export const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object'] as const;
export const STRING_FORMATS = ['date', 'date-time', 'email', 'uri', 'uuid', 'password', 'byte', 'binary'] as const;
export const NUMBER_FORMATS = ['int32', 'int64', 'float', 'double'] as const;

export const HTTP_STATUS_CODES = [
  { code: '200', description: 'OK' },
  { code: '201', description: 'Created' },
  { code: '204', description: 'No Content' },
  { code: '400', description: 'Bad Request' },
  { code: '401', description: 'Unauthorized' },
  { code: '403', description: 'Forbidden' },
  { code: '404', description: 'Not Found' },
  { code: '422', description: 'Unprocessable Entity' },
  { code: '500', description: 'Internal Server Error' },
] as const;
