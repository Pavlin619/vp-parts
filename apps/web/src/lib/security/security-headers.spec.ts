import {
  REMOTE_IMAGE_HOSTS,
  SECURITY_HEADERS,
  contentSecurityPolicyDirectives,
  imageRemotePatterns,
} from "./security-headers";

function headerValue(key: string): string | undefined {
  return SECURITY_HEADERS.find((header) => header.key === key)?.value;
}

describe("SECURITY_HEADERS", () => {
  it("refuses every frame, for browsers that predate frame-ancestors too", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
  });

  it("pins HTTPS, stops MIME sniffing and trims the referrer", () => {
    expect(headerValue("Strict-Transport-Security")).toMatch(/^max-age=\d+; includeSubDomains$/);
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps geolocation for the office map's own page and turns off what the shop never uses", () => {
    const permissions = headerValue("Permissions-Policy");

    expect(permissions).toContain("geolocation=(self)");
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("microphone=()");
  });
});

describe("contentSecurityPolicyDirectives", () => {
  const directives = contentSecurityPolicyDirectives({
    apiUrl: "https://api.vp-parts.bg/v1",
    mapStyleUrl: "https://tiles.openfreemap.org/styles/positron",
  });

  it("lets the browser reach the API and the map tiles by origin", () => {
    expect(directives["connect-src"]).toEqual([
      "https://api.vp-parts.bg",
      "https://tiles.openfreemap.org",
    ]);
  });

  it("allows every remote image host, plus the map's data and blob images", () => {
    expect(directives["img-src"]).toEqual(
      expect.arrayContaining(["data:", "blob:", "https://*.tecalliance.net", "https://placehold.co"]),
    );
    expect(directives["img-src"]).toHaveLength(REMOTE_IMAGE_HOSTS.length + 2);
  });

  it("forbids plugins, base rewrites and framing", () => {
    expect(directives["object-src"]).toEqual(["none"]);
    expect(directives["base-uri"]).toEqual(["self"]);
    expect(directives["frame-ancestors"]).toEqual(["none"]);
  });
});

describe("imageRemotePatterns", () => {
  it("serves the same hosts to next/image, with a wildcard for any subdomain depth", () => {
    expect(imageRemotePatterns()).toEqual(
      expect.arrayContaining([
        { protocol: "https", hostname: "**.tecalliance.net" },
        { protocol: "https", hostname: "placehold.co" },
      ]),
    );
    expect(imageRemotePatterns()).toHaveLength(REMOTE_IMAGE_HOSTS.length);
  });
});
