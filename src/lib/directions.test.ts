import { describe, expect, it } from "vitest";
import { detectMapsPlatform, walkingDirectionsUrl } from "./directions";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipod: "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("detectMapsPlatform", () => {
  it("genkender iPhone, iPod og iPad", () => {
    expect(detectMapsPlatform(UA.iphone, 5)).toBe("ios");
    expect(detectMapsPlatform(UA.ipod)).toBe("ios");
    expect(detectMapsPlatform(UA.ipad, 5)).toBe("ios");
  });

  it("genkender en iPad, der udgiver sig for at være en Mac", () => {
    expect(detectMapsPlatform(UA.mac, 5)).toBe("ios");
  });

  it("lader en rigtig Mac, Android og Windows bruge Google Maps", () => {
    expect(detectMapsPlatform(UA.mac, 0)).toBe("other");
    expect(detectMapsPlatform(UA.mac)).toBe("other");
    expect(detectMapsPlatform(UA.android, 5)).toBe("other");
    expect(detectMapsPlatform(UA.windows, 10)).toBe("other");
    expect(detectMapsPlatform("")).toBe("other");
  });
});

describe("walkingDirectionsUrl", () => {
  const pub = { lat: 55.676098, lng: 12.568337 };

  it("giver Apple Kort med gåruten på iOS", () => {
    expect(walkingDirectionsUrl(pub, "ios")).toBe("https://maps.apple.com/?daddr=55.676098,12.568337&dirflg=w");
  });

  it("giver Google Maps med gåruten alle andre steder", () => {
    expect(walkingDirectionsUrl(pub, "other")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=55.676098,12.568337&travelmode=walking",
    );
  });

  it("skriver koordinaterne med seks decimaler, også negative", () => {
    const url = new URL(walkingDirectionsUrl({ lat: -33.8688197, lng: 151.2 }, "other"));
    expect(url.searchParams.get("destination")).toBe("-33.868820,151.200000");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });
});
