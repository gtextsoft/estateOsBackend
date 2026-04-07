export function extractCodeFromQrPayload(raw: string) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  // If QR contains a URL like `${origin}/dashboard/security?code=XYZ`
  try {
    const url = new URL(trimmed);
    const fromParam = url.searchParams.get("code");
    if (fromParam) return fromParam.trim();
  } catch {
    // not a full URL
  }

  // If QR contains a querystring anywhere
  const match = trimmed.match(/[?&]code=([^&]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }

  // Otherwise treat the raw value as the code itself.
  return trimmed;
}

