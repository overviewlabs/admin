import { Component, type ReactNode } from "react";
/** A failed optional visual must not take down its conversation. */
export class InteractiveAnswerBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  override state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  override render(){return this.state.failed?<p role="alert" className="text-sm text-destructive">This interactive answer could not load. Reload the page to try again.</p>:this.props.children;}
}
