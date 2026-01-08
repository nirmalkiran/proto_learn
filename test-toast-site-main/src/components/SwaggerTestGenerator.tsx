import { APIDesigner } from "./api-design";

export const SwaggerTestGenerator = ({ projectId }: { projectId?: string }) => {
  return <APIDesigner projectId={projectId} />;
};
