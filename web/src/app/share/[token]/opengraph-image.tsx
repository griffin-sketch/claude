import { ImageResponse } from "next/og";
import { admin } from "@/lib/server";

/** The preview card shown when a share link is texted or DM'd: the listing's front photo and its address. */
export const alt = "Your listing videos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let address = "Your listing videos", city = "", photo: string | null = null;
  if (UUID.test(token)) {
    const db = admin();
    const { data: l } = await db.from("listings").select("id, address, city_line").eq("share_token", token).single();
    if (l) {
      address = l.address || address;
      city = l.city_line || "";
      const { data: shot } = await db.from("shots").select("photo_path").eq("listing_id", l.id).order("position").limit(1).maybeSingle();
      if (shot && /\.(jpe?g|png)$/i.test(shot.photo_path)) {
        photo = (await db.storage.from("photos").createSignedUrl(shot.photo_path, 600)).data?.signedUrl ?? null;
      }
    }
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#C4553A" }}>
        {photo && (
          <img src={photo} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, display: "flex",
          background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.78))" }} />
        <div style={{ position: "absolute", left: 56, right: 56, bottom: 48, display: "flex", flexDirection: "column", color: "white" }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#FFD9CC" }}>Your listing videos are ready</div>
          <div style={{ fontSize: 60, fontWeight: 700, marginTop: 8, lineHeight: 1.05 }}>{address}</div>
          {city && <div style={{ fontSize: 30, marginTop: 6, opacity: 0.9 }}>{city}</div>}
        </div>
        <div style={{ position: "absolute", top: 36, right: 40, display: "flex", alignItems: "center", gap: 10,
          background: "#C4553A", color: "white", borderRadius: 999, padding: "10px 22px", fontSize: 28, fontWeight: 700 }}>
          Tourvo
        </div>
      </div>
    ),
    { ...size },
  );
}
