import {describe, expect, it} from "vitest";
import {allowedLink, imageSource, sourceError} from "./schema";
describe("OpenUI transport limits", () => {
  it("bounds accumulated output and statements", () => {
    expect(sourceError('root = Stack([])')).toBeNull();
    expect(sourceError('x'.repeat(100001))).toContain('too large');
    expect(sourceError('a\n'.repeat(301))).toContain('too many');
    expect(sourceError('{"ui":"root=Stack([])","scripts":{}}')).toContain('script bundle');
    expect(sourceError('root = Query("fetch", {})')).toContain('browser tool');
    expect(sourceError('root = TextContent("Query( is just text")')).toBeNull();
  });
  it("rejects executable, protocol-relative and credential-bearing URLs", () => {
    for (const url of ['javascript:alert(1)','data:text/html,x','http://example.com','https://u:p@example.com','//example.com/x','/\\evil/x']) {
      expect(allowedLink({url})).toBeNull();
      expect(imageSource(url)).toBeNull();
    }
    expect(imageSource('/admin-portal/api/files/images/x')).toContain('/api/files/');
    expect(imageSource('https://example.com/x.png')).toBe('https://example.com/x.png');
    expect(imageSource('data:image/png;base64,AA==')).toContain('data:image/png');
    expect(imageSource('data:image/svg+xml;base64,AA==')).toBeNull();
  });
});
