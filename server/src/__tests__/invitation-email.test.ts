import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));
import { invitationEmailContent, invitationEmailTransport, sendInvitationEmail } from "../services/invitation-email.js";
const input = { to: "person@example.com", companyName: 'Example <script>alert("x")</script>', inviteUrl: "https://overviewlabs.ai/invite/test-token", role: "viewer", expiresAt: new Date("2026-10-10T00:00:00Z") };
let directory: string;
beforeEach(async () => {
  vi.clearAllMocks(); directory = await mkdtemp(join(tmpdir(), "smtp-test-"));
  const file = join(directory, "password"); await writeFile(file, "test-password", { mode: 0o600 });
  vi.stubEnv("WHOXOS_SMTP_HOST", "smtp.example.com"); vi.stubEnv("WHOXOS_SMTP_PORT", "465");
  vi.stubEnv("WHOXOS_SMTP_USER", "noreply@example.com"); vi.stubEnv("WHOXOS_SMTP_FROM", "noreply@example.com");
  vi.stubEnv("WHOXOS_SMTP_PASSWORD_FILE", file);
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ accepted: [input.to], rejected: [] });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
describe("invitation email", () => {
  it("renders escaped HTML and plain text with a single-use link, role and expiry", () => {
    const mail = invitationEmailContent(input);
    expect(mail.html).not.toContain("<script>"); expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain('src="cid:overview-labs-logo"');
    expect(mail.html).toContain("an organization on WHOXOS");
    expect(mail.html).toContain("Organization</td>");
    expect(mail.text).toContain(input.inviteUrl); expect(mail.text).toContain("single-use");
    expect(mail.text).toContain("viewer"); expect(mail.text).toContain("October 10, 2026");
  });
  it("rejects header injection and insecure URLs", () => {
    expect(() => invitationEmailContent({ ...input, to: "a@example.com\r\nBcc: b@example.com" })).toThrow();
    expect(() => invitationEmailContent({ ...input, inviteUrl: "http://evil.test/invite/x" })).toThrow();
  });
  it("uses certificate-verified TLS on 465 and the configured sender", async () => {
    await sendInvitationEmail(input);
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, logger: false, debug: false, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true } }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: { name: "WHOXOS", address: "noreply@example.com" }, to: input.to }));
    expect(mocks.sendMail.mock.calls[0][0].attachments[0]).toMatchObject({ cid: "overview-labs-logo", contentType: "image/png", contentDisposition: "inline" });
    expect(Buffer.isBuffer(mocks.sendMail.mock.calls[0][0].attachments[0].content)).toBe(true);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
  it("requires STARTTLS for submission ports and disallows plaintext SMTP", async () => {
    vi.stubEnv("WHOXOS_SMTP_PORT", "587"); await invitationEmailTransport();
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
    vi.stubEnv("WHOXOS_SMTP_PORT", "25"); await expect(invitationEmailTransport()).rejects.toThrow();
  });
  it("never reports a rejected recipient as sent and closes failed transports", async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: [input.to] });
    await expect(sendInvitationEmail(input)).rejects.toThrow("did not accept"); expect(mocks.close).toHaveBeenCalledTimes(1);
    mocks.sendMail.mockRejectedValue(new Error("authentication failed"));
    await expect(sendInvitationEmail(input)).rejects.toThrow(); expect(mocks.close).toHaveBeenCalledTimes(2);
  });
});
