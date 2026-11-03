import { NextRequest } from "next/server";
import { dispatchDshPluginRoute } from "@/lib/dsh-plugin-host";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string[] }>;
};

async function handleRpcRequest(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { slug } = await params;
  const targetPath = "/" + (Array.isArray(slug) ? slug.join("/") : "");
  return await dispatchDshPluginRoute(targetPath, request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return await handleRpcRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return await handleRpcRequest(request, context);
}
