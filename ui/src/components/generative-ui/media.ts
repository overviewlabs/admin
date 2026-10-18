import {allowedLink} from "./schema";

export type MediaTarget = {kind:"video"|"audio"|"embed"|"link"; src:string; provider:string; poster?:string; compact?:boolean};
/** Never accept model-authored iframe URLs. Provider frames are constructed
 * from validated public content IDs; other URLs use native media elements. */
export function mediaTarget(value:unknown, type:"video"|"audio"):MediaTarget|null {
  if(typeof value!=="string")return null;
  if(value.startsWith("/")&&!value.startsWith("//")&&!value.includes("\\")&&!/[\r\n]/.test(value))return {kind:type,src:value,provider:"Media file"};
  const safe=allowedLink({url:value});if(!safe)return null;
  const url=new URL(safe),host=url.hostname,path=url.pathname.split("/").filter(Boolean);
  if(["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com","youtube-nocookie.com"].includes(host)) {
    const id=host==="youtu.be"?path[0]:path[0]==="watch"?url.searchParams.get("v"):["embed","shorts","live"].includes(path[0])?path[1]:null;
    if(!id||!/^[a-zA-Z0-9_-]{11}$/.test(id))return {kind:"link",src:safe,provider:"YouTube"};
    return {kind:"embed",src:`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&controls=1&rel=0&autoplay=1`,provider:"YouTube",poster:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};
  }
  if(["vimeo.com","www.vimeo.com","player.vimeo.com"].includes(host)) {
    const id=path.find(segment=>/^\d{6,12}$/.test(segment));
    if(!id)return {kind:"link",src:safe,provider:"Vimeo"};
    const params=new URLSearchParams({autoplay:"1",dnt:"1"});
    const hash=url.searchParams.get("h")??path[path.indexOf(id)+1];if(hash&&/^[a-f0-9]{6,16}$/i.test(hash))params.set("h",hash);
    return {kind:"embed",src:`https://player.vimeo.com/video/${id}?${params}`,provider:"Vimeo"};
  }
  if(host==="open.spotify.com") {
    const index=path.findIndex(segment=>["track","album","playlist","episode","show"].includes(segment)),id=path[index+1];
    if(index<0||!id||!/^[a-zA-Z0-9]{22}$/.test(id))return {kind:"link",src:safe,provider:"Spotify"};
    return {kind:"embed",src:`https://open.spotify.com/embed/${path[index]}/${id}`,provider:"Spotify",compact:path[index]==="track"||path[index]==="episode"};
  }
  // A page URL from an unsupported provider is not a playable file.
  if(type==="video"&&host.endsWith("spotify.com"))return {kind:"link",src:safe,provider:"Source"};
  return {kind:type,src:safe,provider:"Media file"};
}
