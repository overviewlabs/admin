import {describe,expect,it} from "vitest";
import {mediaTarget} from "./media";
describe("trusted media resolution",()=>{
  it("constructs provider frames from actual content IDs, discarding supplied embed parameters",()=>{
    const video=mediaTarget("https://www.youtube.com/watch?v=M7lc1UVf-VE&origin=https://evil.example&enablejsapi=1","video");
    expect(video?.src).toBe("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1&controls=1&rel=0&autoplay=1");
    expect(video?.poster).toContain("/M7lc1UVf-VE/");
    expect(mediaTarget("https://youtu.be/M7lc1UVf-VE","video")).toEqual(video);
    expect(mediaTarget("https://vimeo.com/123456789/aabbccdd","video")?.src).toContain("/video/123456789?autoplay=1&dnt=1&h=aabbccdd");
    expect(mediaTarget("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC","audio")?.src).toBe("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC");
  });
  it("rejects executable URLs and keeps non-video provider pages as source links",()=>{
    for(const source of ["javascript:alert(1)","data:text/html,x","//evil.example/video.mp4","/\\evil.example/x","https://user:pass@example.com/file.mp3","http://example.com/video.mp4"])
      expect(mediaTarget(source,"video")).toBeNull();
    expect(mediaTarget("https://youtube.com/results?search_query=weather","video")?.kind).toBe("link");
    expect(mediaTarget("https://youtube.com/watch?v=not-a-video-id","video")?.kind).toBe("link");
    // Lookalike domains never become iframes.
    expect(mediaTarget("https://youtube.com.evil.example/watch?v=M7lc1UVf-VE","video")?.kind).toBe("video");
    expect(mediaTarget("https://vimeo.com/channels/","video")?.kind).toBe("link");
  });
  it("uses native players for returned file URLs, including authenticated local downloads",()=>{
    expect(mediaTarget("/api/attachments/id/content","video")?.kind).toBe("video");
    expect(mediaTarget("https://storage.example/download/audio","audio")?.kind).toBe("audio");
  });
});
