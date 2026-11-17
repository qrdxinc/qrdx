import { updateQrCode } from "@/actions/qr-codes";
import { actionRoute } from "@/lib/widget-routes/server";

type Context = { params: Promise<{ id: string }> };

/**
 * The Dynamic toggle's changes to its linked code: a new destination or the
 * design. Runs updateQrCode (the session's workspace, its validation and
 * checks); the id comes from the path.
 */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  return actionRoute(req, (body) =>
    updateQrCode({ ...body, id } as Parameters<typeof updateQrCode>[0]),
  );
}
