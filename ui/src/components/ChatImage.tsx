import {useState,type ImgHTMLAttributes,type Ref} from "react";
import {cn} from "@/lib/utils";

type Props=ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?:string;
  containerClassName?:string;
  imageRef?:Ref<HTMLImageElement>;
  retryable?:boolean;
};

/** Retry only on request; never leave the browser's broken-image glyph visible. */
export function ChatImage(props:Props){return <ChatImageContent key={props.src} {...props}/>;}
function ChatImageContent({src,fallbackSrc,alt="",className,containerClassName,imageRef,retryable=true,onLoad,onError,...props}:Props){
  const [fallback,setFallback]=useState(false),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0);
  const current=fallback?fallbackSrc:src;
  return <span className={cn("relative inline-flex min-w-0 items-center justify-center",!loaded&&!failed&&"min-h-16 min-w-24",containerClassName)} data-image-state={failed?"failed":loaded?"loaded":"loading"}>
    {!failed&&<img {...props} key={`${current}:${attempt}`} ref={imageRef} src={current} alt={alt} className={cn(className,!loaded&&"invisible")}
      onLoad={event=>{setLoaded(true);onLoad?.(event);}}
      onError={event=>{onError?.(event);setLoaded(false);if(!fallback&&fallbackSrc&&fallbackSrc!==src)setFallback(true);else setFailed(true);}}/>}
    {!loaded&&!failed&&<span role="status" className="absolute inset-0 flex items-center justify-center p-2 text-xs text-muted-foreground">Loading image…</span>}
    {failed&&<span className="flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
      <span role="status">Image unavailable</span>
      {retryable?<button type="button" className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground hover:bg-muted" onClick={event=>{event.preventDefault();event.stopPropagation();setFallback(false);setFailed(false);setLoaded(false);setAttempt(value=>value+1);}}>Retry image</button>:<span>Open to retry</span>}
    </span>}
  </span>;
}
