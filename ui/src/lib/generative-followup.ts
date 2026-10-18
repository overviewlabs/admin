import { useEffect, useRef, type RefObject } from "react";
import { loadInteractiveAnswer } from "../components/generative-ui/load";
export const GENERATIVE_FOLLOWUP_EVENT = "overview:prepare-followup";
interface FollowupRequest { text: string; accepted: boolean; error?: string }
/** Prepare a draft in the one composer belonging to this chat; never auto-send. */
export function prepareGenerativeFollowup(origin: HTMLElement, text: string) {
  const scope = origin.closest("[data-generative-chat-scope], main, .whox-content") ?? document;
  const composers = scope instanceof HTMLElement && scope.matches('[data-generative-composer="true"]') ? [scope] : scope.querySelectorAll<HTMLElement>('[data-generative-composer="true"]');
  if (composers.length !== 1) throw new Error("Open the conversation before preparing this follow-up.");
  const detail: FollowupRequest = {text, accepted:false};
  composers[0]!.dispatchEvent(new CustomEvent(GENERATIVE_FOLLOWUP_EVENT, {detail}));
  if (!detail.accepted) throw new Error(detail.error ?? "The chat cannot accept a follow-up right now.");
}
export function useGenerativeFollowup(ref: RefObject<HTMLElement | null>, value: string, onChange: (text:string)=>void, disabled = false, focus?: ()=>void) {
  const current = useRef({value,onChange,disabled,focus});current.current={value,onChange,disabled,focus};
  useEffect(() => {
    const el=ref.current;if(!el)return;
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<FollowupRequest>).detail;
      if(!detail || typeof detail.text!=="string" || !detail.text.trim() || detail.text.length>4000)return;
      const state=current.current;
      if(state.disabled){detail.error="This chat is busy or unavailable. Try again when it is ready.";return;}
      if(state.value.trim()){detail.error="Send or clear your current draft first. It has been kept.";return;}
      state.onChange(detail.text.trim());detail.accepted=true;state.focus?.();
    };
    el.addEventListener(GENERATIVE_FOLLOWUP_EVENT,handler);
    const warm=()=>{void loadInteractiveAnswer().catch(()=>{});};
    el.addEventListener("focusin",warm,{once:true});
    return ()=>{el.removeEventListener(GENERATIVE_FOLLOWUP_EVENT,handler);el.removeEventListener("focusin",warm);};
  });
}
