import { SchemaObject, APIEndpoint, APISpecification, SchemaRef } from "./types";

// Generate sample data from schema
export const generateSampleFromSchema = (
  schema: SchemaObject, 
  resolveRef: (refPath: string) => SchemaObject | undefined,
  depth: number = 0
): any => {
  if (depth > 5) return null; // Prevent infinite recursion

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref);
    if (resolved) {
      return generateSampleFromSchema(resolved, resolveRef, depth + 1);
    }
    return null;
  }

  // Use example if provided
  if (schema.example !== undefined) {
    return schema.example;
  }

  // Use default if provided
  if (schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
      }
      return generateStringByFormat(schema.format);
      
    case 'number':
    case 'integer':
      if (schema.minimum !== undefined) return schema.minimum;
      if (schema.maximum !== undefined) return Math.floor(schema.maximum / 2);
      return schema.type === 'integer' ? 1 : 1.5;
      
    case 'boolean':
      return true;
      
    case 'array':
      if (schema.items) {
        return [generateSampleFromSchema(schema.items, resolveRef, depth + 1)];
      }
      return [];
      
    case 'object':
      const obj: Record<string, any> = {};
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          obj[key] = generateSampleFromSchema(propSchema, resolveRef, depth + 1);
        });
      }
      return obj;
      
    default:
      return null;
  }
};

const generateStringByFormat = (format?: string): string => {
  switch (format) {
    case 'date':
      return new Date().toISOString().split('T')[0];
    case 'date-time':
      return new Date().toISOString();
    case 'email':
      return 'user@example.com';
    case 'uri':
      return 'https://example.com/resource';
    case 'uuid':
      return 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    case 'password':
      return '********';
    default:
      return 'string';
  }
};

// Create new endpoint with defaults
export const createNewEndpoint = (): APIEndpoint => ({
  id: crypto.randomUUID(),
  path: '/api/v1/resource',
  method: 'GET',
  summary: 'New Endpoint',
  description: '',
  operationId: '',
  tags: [],
  parameters: [],
  responses: {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: { type: 'object', properties: {} }
        }
      }
    }
  }
});

// Convert endpoints to OpenAPI spec
export const endpointsToOpenAPISpec = (
  endpoints: APIEndpoint[],
  schemaRefs: SchemaRef[],
  info: { title: string; version: string; description?: string },
  servers?: Array<{ url: string; description?: string }>
): APISpecification => {
  const paths: Record<string, Record<string, any>> = {};

  endpoints.forEach(endpoint => {
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }

    const operation: any = {
      summary: endpoint.summary,
      operationId: endpoint.operationId || undefined,
      tags: endpoint.tags.length > 0 ? endpoint.tags : undefined,
    };

    if (endpoint.description) {
      operation.description = endpoint.description;
    }

    if (endpoint.parameters.length > 0) {
      operation.parameters = endpoint.parameters.map(p => ({
        name: p.name,
        in: p.in,
        required: p.required,
        description: p.description || undefined,
        schema: p.schema
      }));
    }

    if (endpoint.requestBody) {
      operation.requestBody = endpoint.requestBody;
    }

    operation.responses = {};
    Object.entries(endpoint.responses).forEach(([code, response]) => {
      operation.responses[code] = {
        description: response.description,
        content: response.content
      };
    });

    paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
  });

  const spec: APISpecification = {
    openapi: '3.0.3',
    info,
    paths
  };

  if (servers && servers.length > 0) {
    spec.servers = servers;
  }

  if (schemaRefs.length > 0) {
    spec.components = {
      schemas: schemaRefs.reduce((acc, ref) => {
        acc[ref.name] = ref.schema;
        return acc;
      }, {} as Record<string, SchemaObject>)
    };
  }

  return spec;
};

// Parse OpenAPI spec to endpoints
export const openAPISpecToEndpoints = (spec: any): { 
  endpoints: APIEndpoint[]; 
  schemaRefs: SchemaRef[];
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
} => {
  const endpoints: APIEndpoint[] = [];
  const schemaRefs: SchemaRef[] = [];

  // Extract schema refs
  if (spec.components?.schemas) {
    Object.entries(spec.components.schemas).forEach(([name, schema]) => {
      schemaRefs.push({ name, schema: schema as SchemaObject });
    });
  }

  // Extract endpoints
  Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
    Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        endpoints.push({
          id: crypto.randomUUID(),
          path,
          method: method.toUpperCase() as APIEndpoint['method'],
          summary: operation.summary || '',
          description: operation.description || '',
          operationId: operation.operationId || '',
          tags: operation.tags || [],
          parameters: (operation.parameters || []).map((p: any) => ({
            name: p.name,
            in: p.in,
            required: p.required || false,
            description: p.description || '',
            schema: p.schema || { type: 'string' }
          })),
          requestBody: operation.requestBody,
          responses: operation.responses || {},
          security: operation.security
        });
      }
    });
  });

  return {
    endpoints,
    schemaRefs,
    info: spec.info || { title: 'API', version: '1.0.0' },
    servers: spec.servers
  };
};
