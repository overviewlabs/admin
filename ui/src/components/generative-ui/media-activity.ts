import {createContext} from "react";
/** Explicit playback can keep the answer mounted while the user scrolls.
 * Inactive visuals retain their existing offscreen dormancy behavior. */
export const MediaActivityContext=createContext<(id:string,playing:boolean)=>void>(()=>{});
