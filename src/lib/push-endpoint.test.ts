import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "./push-endpoint";

describe("isPushEndpoint", () => {
  it("godtager browsernes push-tjenester", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:APA91b")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx2")).toBe(true);
    expect(isPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=BQYAAA")).toBe(true);
    expect(isPushEndpoint("https://FCM.googleapis.com/fcm/send/abc")).toBe(true);
  });

  it("afviser andre servere og skæve adresser", () => {
    expect(isPushEndpoint("https://victim.example/api/expensive")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("https://evilfcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com@evil.example/x")).toBe(false);
    expect(isPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://notify.windows.com/x")).toBe(false);
    expect(isPushEndpoint("https://.notify.windows.com/x")).toBe(false);
    expect(isPushEndpoint("ikke en adresse")).toBe(false);
  });
});
