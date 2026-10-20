import { getViewer } from "@/server/auth";
import { handler, notFound } from "@/server/http";
import { getProductBySlug, publicReviewsForProduct } from "@/server/repo";

export const GET = handler(async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  await getViewer();
  const product = getProductBySlug((await params).slug);
  if (!product) throw notFound("Product not found.");
  return publicReviewsForProduct(product.id);
});
