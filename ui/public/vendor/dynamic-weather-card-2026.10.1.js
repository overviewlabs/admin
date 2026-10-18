var v=function(e,t,i,a){var n=arguments.length,o=n<3?t:a===null?a=Object.getOwnPropertyDescriptor(t,i):a,r;if(typeof Reflect==="object"&&typeof Reflect.decorate==="function")o=Reflect.decorate(e,t,i,a);else for(var s=e.length-1;s>=0;s--)if(r=e[s])o=(n<3?r(o):n>3?r(t,i,o):r(t,i))||o;return n>3&&o&&Object.defineProperty(t,i,o),o};var ze=globalThis,Pe=ze.ShadowRoot&&(ze.ShadyCSS===void 0||ze.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Ye=Symbol(),qt=new WeakMap;class De{constructor(e,t,i){if(this._$cssResult$=!0,i!==Ye)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o,t=this.t;if(Pe&&e===void 0){let i=t!==void 0&&t.length===1;i&&(e=qt.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&qt.set(t,e))}return e}toString(){return this.cssText}}var Vt=(e)=>new De(typeof e=="string"?e:e+"",void 0,Ye),H=(e,...t)=>{let i=e.length===1?e[0]:t.reduce((a,n,o)=>a+((r)=>{if(r._$cssResult$===!0)return r.cssText;if(typeof r=="number")return r;throw Error("Value passed to 'css' function must be a 'css' function result: "+r+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+e[o+1],e[0]);return new De(i,e,Ye)},Gt=(e,t)=>{if(Pe)e.adoptedStyleSheets=t.map((i)=>i instanceof CSSStyleSheet?i:i.styleSheet);else for(let i of t){let a=document.createElement("style"),n=ze.litNonce;n!==void 0&&a.setAttribute("nonce",n),a.textContent=i.cssText,e.appendChild(a)}},Ze=Pe?(e)=>e:(e)=>e instanceof CSSStyleSheet?((t)=>{let i="";for(let a of t.cssRules)i+=a.cssText;return Vt(i)})(e):e;var{is:ya,defineProperty:wa,getOwnPropertyDescriptor:va,getOwnPropertyNames:ka,getOwnPropertySymbols:ba,getPrototypeOf:xa}=Object,$e=globalThis,Kt=$e.trustedTypes,Sa=Kt?Kt.emptyScript:"",Ma=$e.reactiveElementPolyfillSupport,he=(e,t)=>e,ce={toAttribute(e,t){switch(t){case Boolean:e=e?Sa:null;break;case Object:case Array:e=e==null?e:JSON.stringify(e)}return e},fromAttribute(e,t){let i=e;switch(t){case Boolean:i=e!==null;break;case Number:i=e===null?null:Number(e);break;case Object:case Array:try{i=JSON.parse(e)}catch(a){i=null}}return i}},Fe=(e,t)=>!ya(e,t),Qt={attribute:!0,type:String,converter:ce,reflect:!1,useDefault:!1,hasChanged:Fe};Symbol.metadata??=Symbol("metadata"),$e.litPropertyMetadata??=new WeakMap;class O extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=Qt){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){let i=Symbol(),a=this.getPropertyDescriptor(e,i,t);a!==void 0&&wa(this.prototype,e,a)}}static getPropertyDescriptor(e,t,i){let{get:a,set:n}=va(this.prototype,e)??{get(){return this[t]},set(o){this[t]=o}};return{get:a,set(o){let r=a?.call(this);n?.call(this,o),this.requestUpdate(e,r,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Qt}static _$Ei(){if(this.hasOwnProperty(he("elementProperties")))return;let e=xa(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(he("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(he("properties"))){let t=this.properties,i=[...ka(t),...ba(t)];for(let a of i)this.createProperty(a,t[a])}let e=this[Symbol.metadata];if(e!==null){let t=litPropertyMetadata.get(e);if(t!==void 0)for(let[i,a]of t)this.elementProperties.set(i,a)}this._$Eh=new Map;for(let[t,i]of this.elementProperties){let a=this._$Eu(t,i);a!==void 0&&this._$Eh.set(a,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){let t=[];if(Array.isArray(e)){let i=new Set(e.flat(1/0).reverse());for(let a of i)t.unshift(Ze(a))}else e!==void 0&&t.push(Ze(e));return t}static _$Eu(e,t){let i=t.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise((e)=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach((e)=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){let e=new Map,t=this.constructor.elementProperties;for(let i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){let e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Gt(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach((e)=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach((e)=>e.hostDisconnected?.())}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){let i=this.constructor.elementProperties.get(e),a=this.constructor._$Eu(e,i);if(a!==void 0&&i.reflect===!0){let n=(i.converter?.toAttribute!==void 0?i.converter:ce).toAttribute(t,i.type);this._$Em=e,n==null?this.removeAttribute(a):this.setAttribute(a,n),this._$Em=null}}_$AK(e,t){let i=this.constructor,a=i._$Eh.get(e);if(a!==void 0&&this._$Em!==a){let n=i.getPropertyOptions(a),o=typeof n.converter=="function"?{fromAttribute:n.converter}:n.converter?.fromAttribute!==void 0?n.converter:ce;this._$Em=a;let r=o.fromAttribute(t,n.type);this[a]=r??this._$Ej?.get(a)??r,this._$Em=null}}requestUpdate(e,t,i,a=!1,n){if(e!==void 0){let o=this.constructor;if(a===!1&&(n=this[e]),i??=o.getPropertyOptions(e),!((i.hasChanged??Fe)(n,t)||i.useDefault&&i.reflect&&n===this._$Ej?.get(e)&&!this.hasAttribute(o._$Eu(e,i))))return;this.C(e,t,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:a,wrapped:n},o){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,o??t??this[e]),n!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),a===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}let e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[a,n]of this._$Ep)this[a]=n;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[a,n]of i){let{wrapped:o}=n,r=this[a];o!==!0||this._$AL.has(a)||r===void 0||this.C(a,void 0,n,r)}}let e=!1,t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach((i)=>i.hostUpdate?.()),this.update(t)):this._$EM()}catch(i){throw e=!1,this._$EM(),i}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach((t)=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach((t)=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}}O.elementStyles=[],O.shadowRootOptions={mode:"open"},O[he("elementProperties")]=new Map,O[he("finalized")]=new Map,Ma?.({ReactiveElement:O}),($e.reactiveElementVersions??=[]).push("2.1.2");var Xe=globalThis,Jt=(e)=>e,Ee=Xe.trustedTypes,Yt=Ee?Ee.createPolicy("lit-html",{createHTML:(e)=>e}):void 0;var L=`lit$${Math.random().toFixed(9).slice(2)}$`,et="?"+L,Ca=`<${et}>`,X=document,_e=()=>X.createComment(""),me=(e)=>e===null||typeof e!="object"&&typeof e!="function",tt=Array.isArray,ai=(e)=>tt(e)||typeof e?.[Symbol.iterator]=="function";var pe=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Zt=/-->/g,Xt=/>/g,Y=RegExp(`>|[ 	
\f\r](?:([^\\s"'>=/]+)([ 	
\f\r]*=[ 	
\f\r]*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),ei=/'/g,ti=/"/g,ni=/^(?:script|style|textarea|title)$/i,it=(e)=>(t,...i)=>({_$litType$:e,strings:t,values:i}),_=it(1),b=it(2),Dn=it(3),ee=Symbol.for("lit-noChange"),A=Symbol.for("lit-nothing"),ii=new WeakMap,Z=X.createTreeWalker(X,129);function oi(e,t){if(!tt(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return Yt!==void 0?Yt.createHTML(t):t}var ri=(e,t)=>{let i=e.length-1,a=[],n,o=t===2?"<svg>":t===3?"<math>":"",r=pe;for(let s=0;s<i;s++){let l=e[s],u,d,h=-1,p=0;for(;p<l.length&&(r.lastIndex=p,d=r.exec(l),d!==null);)p=r.lastIndex,r===pe?d[1]==="!--"?r=Zt:d[1]!==void 0?r=Xt:d[2]!==void 0?(ni.test(d[2])&&(n=RegExp("</"+d[2],"g")),r=Y):d[3]!==void 0&&(r=Y):r===Y?d[0]===">"?(r=n??pe,h=-1):d[1]===void 0?h=-2:(h=r.lastIndex-d[2].length,u=d[1],r=d[3]===void 0?Y:d[3]==='"'?ti:ei):r===ti||r===ei?r=Y:r===Zt||r===Xt?r=pe:(r=Y,n=void 0);let c=r===Y&&e[s+1].startsWith("/>")?" ":"";o+=r===pe?l+Ca:h>=0?(a.push(u),l.slice(0,h)+"$lit$"+l.slice(h)+L+c):l+L+(h===-2?s:c)}return[oi(e,o+(e[i]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),a]};class ge{constructor({strings:e,_$litType$:t},i){let a;this.parts=[];let n=0,o=0,r=e.length-1,s=this.parts,[l,u]=ri(e,t);if(this.el=ge.createElement(l,i),Z.currentNode=this.el.content,t===2||t===3){let d=this.el.content.firstChild;d.replaceWith(...d.childNodes)}for(;(a=Z.nextNode())!==null&&s.length<r;){if(a.nodeType===1){if(a.hasAttributes())for(let d of a.getAttributeNames())if(d.endsWith("$lit$")){let h=u[o++],p=a.getAttribute(d).split(L),c=/([.?@])?(.*)/.exec(h);s.push({type:1,index:n,name:c[2],strings:p,ctor:c[1]==="."?nt:c[1]==="?"?ot:c[1]==="@"?rt:oe}),a.removeAttribute(d)}else d.startsWith(L)&&(s.push({type:6,index:n}),a.removeAttribute(d));if(ni.test(a.tagName)){let d=a.textContent.split(L),h=d.length-1;if(h>0){a.textContent=Ee?Ee.emptyScript:"";for(let p=0;p<h;p++)a.append(d[p],_e()),Z.nextNode(),s.push({type:2,index:++n});a.append(d[h],_e())}}}else if(a.nodeType===8)if(a.data===et)s.push({type:2,index:n});else{let d=-1;for(;(d=a.data.indexOf(L,d+1))!==-1;)s.push({type:7,index:n}),d+=L.length-1}n++}}static createElement(e,t){let i=X.createElement("template");return i.innerHTML=e,i}}function te(e,t,i=e,a){if(t===ee)return t;let n=a!==void 0?i._$Co?.[a]:i._$Cl,o=me(t)?void 0:t._$litDirective$;return n?.constructor!==o&&(n?._$AO?.(!1),o===void 0?n=void 0:(n=new o(e),n._$AT(e,i,a)),a!==void 0?(i._$Co??=[])[a]=n:i._$Cl=n),n!==void 0&&(t=te(e,n._$AS(e,t.values),n,a)),t}class at{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){let{el:{content:t},parts:i}=this._$AD,a=(e?.creationScope??X).importNode(t,!0);Z.currentNode=a;let n=Z.nextNode(),o=0,r=0,s=i[0];for(;s!==void 0;){if(o===s.index){let l;s.type===2?l=new ne(n,n.nextSibling,this,e):s.type===1?l=new s.ctor(n,s.name,s.strings,this,e):s.type===6&&(l=new st(n,this,e)),this._$AV.push(l),s=i[++r]}o!==s?.index&&(n=Z.nextNode(),o++)}return Z.currentNode=X,a}p(e){let t=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class ne{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,i,a){this.type=2,this._$AH=A,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=a,this._$Cv=a?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode,t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=te(this,e,t),me(e)?e===A||e==null||e===""?(this._$AH!==A&&this._$AR(),this._$AH=A):e!==this._$AH&&e!==ee&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):ai(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==A&&me(this._$AH)?this._$AA.nextSibling.data=e:this.T(X.createTextNode(e)),this._$AH=e}$(e){let{values:t,_$litType$:i}=e,a=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=ge.createElement(oi(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===a)this._$AH.p(t);else{let n=new at(a,this),o=n.u(this.options);n.p(t),this.T(o),this._$AH=n}}_$AC(e){let t=ii.get(e.strings);return t===void 0&&ii.set(e.strings,t=new ge(e)),t}k(e){tt(this._$AH)||(this._$AH=[],this._$AR());let t=this._$AH,i,a=0;for(let n of e)a===t.length?t.push(i=new ne(this.O(_e()),this.O(_e()),this,this.options)):i=t[a],i._$AI(n),a++;a<t.length&&(this._$AR(i&&i._$AB.nextSibling,a),t.length=a)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){let i=Jt(e).nextSibling;Jt(e).remove(),e=i}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}}class oe{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,a,n){this.type=1,this._$AH=A,this._$AN=void 0,this.element=e,this.name=t,this._$AM=a,this.options=n,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=A}_$AI(e,t=this,i,a){let n=this.strings,o=!1;if(n===void 0)e=te(this,e,t,0),o=!me(e)||e!==this._$AH&&e!==ee,o&&(this._$AH=e);else{let r=e,s,l;for(e=n[0],s=0;s<n.length-1;s++)l=te(this,r[i+s],t,s),l===ee&&(l=this._$AH[s]),o||=!me(l)||l!==this._$AH[s],l===A?e=A:e!==A&&(e+=(l??"")+n[s+1]),this._$AH[s]=l}o&&!a&&this.j(e)}j(e){e===A?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class nt extends oe{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===A?void 0:e}}class ot extends oe{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==A)}}class rt extends oe{constructor(e,t,i,a,n){super(e,t,i,a,n),this.type=5}_$AI(e,t=this){if((e=te(this,e,t,0)??A)===ee)return;let i=this._$AH,a=e===A&&i!==A||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,n=e!==A&&(i===A||a);a&&this.element.removeEventListener(this.name,this,i),n&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class st{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){te(this,e)}}var si={M:"$lit$",P:L,A:et,C:1,L:ri,R:at,D:ai,V:te,I:ne,H:oe,N:ot,U:rt,B:nt,F:st},Ta=Xe.litHtmlPolyfillSupport;Ta?.(ge,ne),(Xe.litHtmlVersions??=[]).push("3.3.2");var li=(e,t,i)=>{let a=i?.renderBefore??t,n=a._$litPart$;if(n===void 0){let o=i?.renderBefore??null;a._$litPart$=n=new ne(t.insertBefore(_e(),o),o,void 0,i??{})}return n._$AI(e),n};var lt=globalThis;class z extends O{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){let t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=li(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return ee}}z._$litElement$=!0,z.finalized=!0,lt.litElementHydrateSupport?.({LitElement:z});var Aa=lt.litElementPolyfillSupport;Aa?.({LitElement:z});(lt.litElementVersions??=[]).push("4.2.2");var za={attribute:!0,type:String,converter:ce,reflect:!1,hasChanged:Fe},Pa=(e=za,t,i)=>{let{kind:a,metadata:n}=i,o=globalThis.litPropertyMetadata.get(n);if(o===void 0&&globalThis.litPropertyMetadata.set(n,o=new Map),a==="setter"&&((e=Object.create(e)).wrapped=!0),o.set(i.name,e),a==="accessor"){let{name:r}=i;return{set(s){let l=t.get.call(this);t.set.call(this,s),this.requestUpdate(r,l,e,!0,s)},init(s){return s!==void 0&&this.C(r,void 0,e,s),s}}}if(a==="setter"){let{name:r}=i;return function(s){let l=this[r];t.call(this,s),this.requestUpdate(r,l,e,!0,s)}}throw Error("Unsupported decorator location: "+a)};function k(e){return(t,i)=>typeof i=="object"?Pa(e,t,i):((a,n,o)=>{let r=n.hasOwnProperty(o);return n.constructor.createProperty(o,a),r?Object.getOwnPropertyDescriptor(n,o):void 0})(e,t,i)}function fe(e){return k({...e,state:!0,attribute:!1})}var ui="2026.10.1",I={SUNRISE_START:360,SUNRISE_END:480,DAY_END:1080,SUNSET_END:1200},di=["templow","temperature_low","temp_low","min_temp","yandex_pogoda_minimal_forecast_temperature"],m={showFeelsLike:!0,showWind:!0,showWindGust:!0,showWindDirection:!0,showHumidity:!0,showPressure:!1,showUvIndex:!1,showDewPoint:!1,showMinTemp:!0,showPrecipitationOutlook:!1,showTemperatureBars:!1,showForecastWind:!1,showAurora:!1,showRaindrops:!0,showWindEffects:!0,showForecast:!1,showHourlyForecast:!1,showDailyForecast:!1,hourlyForecastHours:5,hourlyForecastStep:1,hourlyForecastChart:!1,showForecastDescription:!1,dailyForecastDays:5,hourlyForecastTitle:null,dailyForecastTitle:null,showSunriseSunset:!0,showClock:!1,showDate:!1,clockPosition:"top",clockFormat:"24h",overlayOpacity:0.1,textShadow:1,language:"auto",height:null,borderRadius:null,sunPositionX:null,sunPositionY:null,textColor:null,windSpeedUnit:"auto",showAnimations:!0,layout:"default",visualStyle:"modern",animationQuality:"high"};var hi={sunny:"Solskin",clear:"Klart",overcast:"Overskyet",cloudy:"Skyet",partlycloudy:"Delvist skyet",rainy:"Regnvejr",rain:"Regn",snowy:"Snevejr",snow:"Sne",foggy:"Tåget",fog:"Tåge",lightning:"Lyn","lightning-rainy":"Tordenvejr",pouring:"Kraftig regn","snowy-rainy":"Slud",hail:"Hagl","clear-night":"Klar nat",windy:"Blæsende","windy-variant":"Blæsende, overskyet",feels_like:"Føles som",forecast_title:"Dagens vejrudsigt",forecast_title_hourly:"Timeprognose",daily_forecast_title:"Daglig vejrudsigt",no_data:"Ingen data",forecast_unavailable:"Vejrudsigt utilgængelig",weather:"Vejr",language:"Sprog",wind_unit_kmh:"km/t",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knob",wind_unit_fts:"ft/s",show_clock:"Vis aktuel tid",am:"FM",pm:"EM",pressure:"Lufttryk",uv_index:"UV-indeks",dew_point:"Dugpunkt",aqi:"Luftkvalitetsindeks",precipitation_outlook:{start:"{kind} ventes omkring {time}",soon:"{kind} ventes snart",stop:"{kind} stopper omkring {time}",continues:"{kind} i mindst {hours} timer mere",rain:"Regn",snow:"Sne",sleet:"Slud",hail:"Hagl",storm:"Tordenvejr"},editor:{entity:"Vejrentitet",name:"Korttitel",layout:"Layout",layout_default:"Standard",layout_minimal:"Minimal",height:"Højde",show_feels_like:"Føles som",show_wind:"Vind",show_wind_gust:"Vindstød",show_wind_direction:"Retning",show_humidity:"Luftfugtighed",show_min_temp:"Min. temperatur",show_hourly_forecast:"Timeprognose",hourly_forecast_hours:"Timer",hourly_forecast_step:"Hver",hourly_forecast_chart:"Temperaturgraf",show_daily_forecast:"Dagsprognose",daily_forecast_days:"Dage",show_sunrise_sunset:"Solopgang og solnedgang",sunrise_entity:"Solopgangssensor",sunset_entity:"Solnedgangssensor",show_clock:"Ur",clock_position:"Placering",clock_position_top:"Øverst",clock_position_details:"Detaljerække",clock_format:"Format",clock_format_12h:"12-timer (FM/EM)",clock_format_24h:"24-timer",overlay_opacity:"Mørkning",language:"Sprog",language_auto:"Automatisk",language_en:"Engelsk",language_ru:"Russisk",language_de:"Tysk",language_nl:"Nederlandsk",language_fr:"Fransk",language_es:"Spansk",language_it:"Italiensk",language_sk:"Slovakisk",language_hu:"Ungarsk",wind_speed_unit:"Enhed for vindhastighed",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/t",wind_speed_unit_auto:"Auto (som integrationen)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knob",wind_speed_unit_helper:"Auto beholder integrationens eller vindsensorens enhed; de andre omregner al vind på kortet",animation_quality:"Animationskvalitet",animation_quality_helper:"Sænk den på vægtablets og langsomme enheder",animation_quality_high:"Høj",animation_quality_low:"Lav (20 FPS, til langsomme enheder)",animation_quality_medium:"Middel (30 FPS, færre partikler)",aqi_entity:"Luftkvalitetssensor (AQI)",border_radius:"Hjørneradius",daily_forecast_title:"Titel",daily_forecast_title_helper:"Tom = standardtitel",dew_point_entity:"Dugpunktssensor",feels_like_entity:"Sensor for føles som",hourly_forecast_title:"Titel",hourly_forecast_title_helper:"Tom = standardtitel",humidity_entity:"Luftfugtighedssensor",overlay_opacity_helper:"0–1, gør himlen mørkere, så teksten er let at læse",precipitation_entity:"Nedbørssensor",pressure_entity:"Lufttrykssensor",section_appearance:"Udseende",section_clock:"Sprog, ur og dato",section_details:"Detaljer",section_forecast:"Prognose",section_sensors:"Sensorer (valgfrit)",sensors:"Sensorer (valgfrit, erstatter vejrenheden)",show_animations:"Animationer",show_aurora:"Nordlys",show_aurora_helper:"I klare nætter, moderne grafik",show_date:"Dato",show_dew_point:"Dugpunkt",show_precipitation_outlook:"Hvornår regnen starter/stopper",show_precipitation_outlook_helper:"Ud fra timeprognosen for de næste 12 timer",show_pressure:"Lufttryk",show_raindrops:"Regndråber på ruden",show_raindrops_helper:"I regnvejr, moderne grafik",show_temperature_bars:"Temperaturbjælker",show_forecast_wind:"Vind i prognoser",show_forecast_wind_helper:"Retning, hastighed og vindstød for hver time og dag, hvis vejrtjenesten oplyser dem",hourly_forecast_step_helper:"Vis prognosen med få timers mellemrum, fx 3 for 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"En temperaturkurve i stedet for tal, med sandsynligheden for nedbør som søjler",show_forecast_description:"Tekstprognose",show_forecast_description_helper:"Vejrtjenestens skrevne prognose, hvis den har en (fx den amerikanske National Weather Service)",show_uv_index:"UV-indeks",show_wind_effects:"Vindstød og blade",show_wind_effects_helper:"I blæsende vejr eller over 8 m/s",sun_position_x:"Sol/måne-position, vandret",sun_position_x_helper:"Lad stå tomt for at følge tidspunktet på dagen",sun_position_y:"Sol/måne-position, lodret",sun_position_y_helper:"Lad stå tomt for at følge tidspunktet på dagen",temperature_entity:"Temperatursensor",text_color:"Tekstfarve",text_color_helper:"Enhver CSS-farve, f.eks. #1a1a2e eller var(--primary-text-color)",text_shadow:"Tekstskygge",uv_index_entity:"UV-indekssensor",visual_style:"Grafik",visual_style_classic:"Klassisk",visual_style_modern:"Moderne",wind_bearing_entity:"Vindretningssensor",wind_gust_entity:"Vindstødssensor",wind_speed_entity:"Vindhastighedssensor",language_da:"Dansk",language_nb:"Norsk (bokmål)",language_pl:"Polsk",language_pt:"Portugisisk",language_sl:"Slovensk",language_sr:"Serbisk",language_tr:"Tyrkisk",language_zh:"Kinesisk",hourly_forecast_hours_helper:"Ingen øvre grænse: f.eks. 72 for tre dage, eller mere for at vise hele udbyderens prognose"}};var ci={sunny:"Sonnig",clear:"Klar",overcast:"Bedeckt",cloudy:"Bewölkt",partlycloudy:"Teilweise bewölkt",rainy:"Regnerisch",rain:"Regen",snowy:"Schneefall",snow:"Schnee",foggy:"Nebelig",fog:"Nebel",lightning:"Blitz","lightning-rainy":"Gewitter",pouring:"Starkregen","snowy-rainy":"Schneeregen",hail:"Hagel","clear-night":"Klare Nacht",windy:"Windig","windy-variant":"Windig, bewölkt",feels_like:"Gefühlt",forecast_title:"Heutige Vorhersage",forecast_title_hourly:"Stündliche Vorhersage",daily_forecast_title:"Tagesvorhersage",no_data:"Keine Daten",forecast_unavailable:"Vorhersage nicht verfügbar",weather:"Wetter",language:"Sprache",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"Knoten",wind_unit_fts:"ft/s",show_clock:"Aktuelle Uhrzeit anzeigen",am:"AM",pm:"PM",pressure:"Luftdruck",uv_index:"UV-Index",dew_point:"Taupunkt",aqi:"Luftqualitätsindex",precipitation_outlook:{start:"{kind} gegen {time} erwartet",soon:"{kind} in Kürze erwartet",stop:"{kind} endet gegen {time}",continues:"{kind} noch mindestens {hours} Std.",rain:"Regen",snow:"Schnee",sleet:"Schneeregen",hail:"Hagel",storm:"Gewitter"},editor:{entity:"Wetter-Entität",name:"Kartentitel",layout:"Layout",layout_default:"Default",layout_minimal:"Minimal",height:"Höhe",show_feels_like:"Gefühlt",show_wind:"Wind",show_wind_gust:"Böen",show_wind_direction:"Richtung",show_humidity:"Luftfeuchtigkeit",show_min_temp:"Tiefsttemperatur",show_hourly_forecast:"Stündliche Vorhersage",hourly_forecast_hours:"Stunden",hourly_forecast_step:"Alle",hourly_forecast_chart:"Temperaturdiagramm",show_daily_forecast:"Tägliche Vorhersage",daily_forecast_days:"Tage",show_sunrise_sunset:"Sonnenauf- und -untergang",sunrise_entity:"Sonnenaufgangssensor",sunset_entity:"Sonnenuntergangssensor",show_clock:"Uhr",clock_position:"Position",clock_position_top:"Oben",clock_position_details:"Details",clock_format:"Format",clock_format_12h:"12-Stunden (AM/PM)",clock_format_24h:"24-Stunden",overlay_opacity:"Abdunklung",text_shadow:"Textschatten",language:"Sprache",language_auto:"Automatisch",language_en:"Englisch",language_ru:"Russisch",language_de:"Deutsch",language_nl:"Niederländisch",language_fr:"Französisch",language_es:"Spanisch",language_it:"Italienisch",language_sk:"Slowakisch",language_hu:"Ungarisch",language_pt:"Portugiesisch",wind_speed_unit:"Einheit der Windgeschwindigkeit",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (wie die Integration)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"Knoten",wind_speed_unit_helper:"Auto behält die Einheit der Integration oder des Windsensors; die anderen rechnen allen Wind auf der Karte um",show_animations:"Animationen",animation_quality:"Animationsqualität",animation_quality_helper:"Für Wandtablets und langsame Geräte verringern",animation_quality_high:"Hoch",animation_quality_low:"Niedrig (20 FPS, für langsame Geräte)",animation_quality_medium:"Mittel (30 FPS, weniger Partikel)",aqi_entity:"Luftqualitätssensor (AQI)",border_radius:"Eckenradius",daily_forecast_title:"Titel",daily_forecast_title_helper:"Leer = Standardtitel",dew_point_entity:"Taupunktsensor",feels_like_entity:"Sensor „Gefühlt“",hourly_forecast_title:"Titel",hourly_forecast_title_helper:"Leer = Standardtitel",humidity_entity:"Luftfeuchtigkeitssensor",overlay_opacity_helper:"0–1, dunkelt den Himmel ab, damit der Text lesbar bleibt",precipitation_entity:"Niederschlagssensor",pressure_entity:"Luftdrucksensor",section_appearance:"Darstellung",section_clock:"Sprache, Uhr und Datum",section_details:"Details",section_forecast:"Vorhersage",section_sensors:"Sensoren (optional)",sensors:"Sensoren (optional, ersetzen die Wetter-Entität)",show_aurora:"Polarlicht",show_aurora_helper:"In klaren Nächten, moderne Grafik",show_date:"Datum",show_dew_point:"Taupunkt",show_precipitation_outlook:"Wann Regen beginnt/endet",show_precipitation_outlook_helper:"Aus der stündlichen Vorhersage für die nächsten 12 Stunden",show_pressure:"Luftdruck",show_raindrops:"Regentropfen auf der Scheibe",show_raindrops_helper:"Bei Regen, moderne Grafik",show_temperature_bars:"Temperaturbalken",show_forecast_wind:"Wind in Vorhersagen",show_forecast_wind_helper:"Richtung, Geschwindigkeit und Böen für jede Stunde und jeden Tag, sofern der Wetterdienst sie liefert",hourly_forecast_step_helper:"Vorhersage alle paar Stunden, z. B. 3 für 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Eine Temperaturkurve statt Zahlen, mit der Regenwahrscheinlichkeit als Balken",show_forecast_description:"Textvorhersage",show_forecast_description_helper:"Die schriftliche Vorhersage des Wetterdienstes, falls vorhanden (z. B. US National Weather Service)",show_uv_index:"UV-Index",show_wind_effects:"Windböen und Blätter",show_wind_effects_helper:"Bei windigem Wetter oder über 8 m/s",sun_position_x:"Sonne/Mond-Position, horizontal",sun_position_x_helper:"Leer lassen, um der Tageszeit zu folgen",sun_position_y:"Sonne/Mond-Position, vertikal",sun_position_y_helper:"Leer lassen, um der Tageszeit zu folgen",temperature_entity:"Temperatursensor",text_color:"Textfarbe",text_color_helper:"Jede CSS-Farbe, z. B. #1a1a2e oder var(--primary-text-color)",uv_index_entity:"UV-Index-Sensor",visual_style:"Grafik",visual_style_classic:"Klassisch",visual_style_modern:"Modern",wind_bearing_entity:"Windrichtungssensor",wind_gust_entity:"Windböensensor",wind_speed_entity:"Windgeschwindigkeitssensor",language_da:"Dänisch",language_nb:"Norwegisch (Bokmål)",language_pl:"Polnisch",language_sl:"Slowenisch",language_sr:"Serbisch",language_tr:"Türkisch",language_zh:"Chinesisch",hourly_forecast_hours_helper:"Ohne Obergrenze: z. B. 72 für drei Tage oder mehr, um die ganze Vorhersage des Anbieters zu zeigen"}};var pi={sunny:"Sunny",clear:"Clear",overcast:"Overcast",cloudy:"Cloudy",partlycloudy:"Partly Cloudy",rainy:"Rainy",rain:"Rain",snowy:"Snowy",snow:"Snow",foggy:"Foggy",fog:"Fog",lightning:"Lightning","lightning-rainy":"Thunderstorm",pouring:"Heavy Rain","snowy-rainy":"Sleet",hail:"Hail","clear-night":"Clear Night",windy:"Windy","windy-variant":"Windy, cloudy",feels_like:"Feels like",forecast_title:"Today's Forecast",forecast_title_hourly:"Hourly Forecast",daily_forecast_title:"Daily Forecast",no_data:"No data",forecast_unavailable:"Forecast unavailable",weather:"Weather",language:"Language",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knots",wind_unit_fts:"ft/s",show_clock:"Show current time",am:"AM",pm:"PM",pressure:"Pressure",uv_index:"UV index",dew_point:"Dew point",aqi:"Air quality index",precipitation_outlook:{start:"{kind} expected around {time}",soon:"{kind} expected soon",stop:"{kind} ending around {time}",continues:"{kind} for at least {hours} more hours",rain:"Rain",snow:"Snow",sleet:"Sleet",hail:"Hail",storm:"Thunderstorms"},editor:{entity:"Weather Entity",name:"Card Title",layout:"Layout",layout_default:"Default",layout_minimal:"Minimal",visual_style:"Graphics",visual_style_modern:"Modern",visual_style_classic:"Classic",animation_quality:"Animation quality",animation_quality_high:"High",animation_quality_medium:"Medium (30 FPS, fewer particles)",animation_quality_low:"Low (20 FPS, for slow devices)",height:"Height",show_feels_like:"Feels like",show_wind:"Wind",show_wind_gust:"Gusts",show_wind_direction:"Direction",show_humidity:"Humidity",show_min_temp:"Min temperature",show_hourly_forecast:"Hourly forecast",hourly_forecast_hours:"Hours",hourly_forecast_step:"Every",hourly_forecast_chart:"Temperature chart",hourly_forecast_title:"Title",show_daily_forecast:"Daily forecast",daily_forecast_days:"Days",daily_forecast_title:"Title",show_sunrise_sunset:"Sunrise and sunset",sunrise_entity:"Sunrise sensor",sunset_entity:"Sunset sensor",sensors:"Sensors (optional, override the weather entity)",temperature_entity:"Temperature Sensor",feels_like_entity:"Feels Like Sensor",humidity_entity:"Humidity Sensor",wind_speed_entity:"Wind Speed Sensor",wind_gust_entity:"Wind Gust Sensor",wind_bearing_entity:"Wind Bearing Sensor",precipitation_entity:"Precipitation Sensor",show_pressure:"Pressure",show_uv_index:"UV index",show_dew_point:"Dew point",show_precipitation_outlook:"When rain starts/stops",show_temperature_bars:"Temperature bars",show_forecast_wind:"Wind in forecasts",show_forecast_wind_helper:"Direction, speed and gusts for each hour and day, when the weather provider reports them",hourly_forecast_step_helper:"Show the forecast every few hours, e.g. 3 for 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"A curve of the temperature instead of numbers, with the chance of precipitation as bars",show_forecast_description:"Text forecast",show_forecast_description_helper:"The weather provider's written forecast, when it has one (e.g. the US National Weather Service)",pressure_entity:"Pressure Sensor",uv_index_entity:"UV Index Sensor",dew_point_entity:"Dew Point Sensor",aqi_entity:"Air Quality (AQI) Sensor",show_clock:"Clock",show_date:"Date",clock_position:"Position",clock_position_top:"Top",clock_position_details:"Details",clock_format:"Format",clock_format_12h:"12-hour (AM/PM)",clock_format_24h:"24-hour",overlay_opacity:"Darkening",text_shadow:"Text shadow",text_color:"Text color",border_radius:"Corner radius",sun_position_x:"Sun/moon position, horizontal",sun_position_y:"Sun/moon position, vertical",language:"Language",language_auto:"Auto",language_en:"English",language_ru:"Russian",language_de:"German",language_nl:"Dutch",language_fr:"French",language_es:"Spanish",language_it:"Italian",language_sk:"Slovak",language_hu:"Hungarian",language_pt:"Portuguese",language_da:"Danish",language_sr:"Serbian",language_pl:"Polish",language_zh:"Chinese",language_tr:"Turkish",language_nb:"Norwegian (Bokmål)",language_sl:"Slovenian",wind_speed_unit:"Wind speed unit",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (from the integration)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knots",wind_speed_unit_helper:"Auto keeps the unit of the integration or wind sensor; the others convert all wind on the card",show_animations:"Animations",show_aurora:"Northern lights",section_appearance:"Appearance",section_details:"Details",section_forecast:"Forecast",section_clock:"Language, clock and date",section_sensors:"Sensors (optional)",animation_quality_helper:"Lower it for wall tablets and slow devices",show_aurora_helper:"On clear nights, Modern graphics",overlay_opacity_helper:"0–1, darkens the sky so text stays readable",text_color_helper:"Any CSS color, e.g. #1a1a2e or var(--primary-text-color)",sun_position_x_helper:"Leave empty to follow the time of day",sun_position_y_helper:"Leave empty to follow the time of day",show_precipitation_outlook_helper:"From the hourly forecast for the next 12 hours",hourly_forecast_title_helper:"Empty = default title",daily_forecast_title_helper:"Empty = default title",show_raindrops:"Raindrops on the glass",show_wind_effects:"Wind gusts and leaves",show_raindrops_helper:"In rain, Modern graphics",show_wind_effects_helper:"In windy weather or above 8 m/s",hourly_forecast_hours_helper:"No upper limit: e.g. 72 for three days, or more to show everything the provider forecasts"}};var _i={sunny:"Soleado",clear:"Despejado",overcast:"Cubierto",cloudy:"Nublado",partlycloudy:"Parcialmente Nublado",rainy:"Lluvioso",rain:"Lluvia",snowy:"Nevado",snow:"Nieve",foggy:"Nublado",fog:"Niebla",lightning:"Rayo","lightning-rainy":"Tormenta Eléctrica",pouring:"Lluvia Intensa","snowy-rainy":"Aguanieve",hail:"Granizo","clear-night":"Noche Despejada",windy:"Ventoso","windy-variant":"Ventoso, nublado",feels_like:"Sensación térmica",forecast_title:"Previsión para hoy",forecast_title_hourly:"Pronóstico por horas",daily_forecast_title:"Previsión Diaria",no_data:"Sin datos",forecast_unavailable:"Previsión no disponible",weather:"Clima",language:"Idioma",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knots",wind_unit_fts:"ft/s",show_clock:"Mostrar hora actual",am:"AM",pm:"PM",pressure:"Presión",uv_index:"Índice UV",dew_point:"Punto de rocío",aqi:"Índice de calidad del aire",precipitation_outlook:{start:"{kind}: empieza hacia {time}",soon:"{kind}: empieza pronto",stop:"{kind}: termina hacia {time}",continues:"{kind}: al menos {hours} h más",rain:"Lluvia",snow:"Nieve",sleet:"Aguanieve",hail:"Granizo",storm:"Tormentas"},editor:{entity:"Entidad de clima",name:"Título de la tarjeta",layout:"Diseño",layout_default:"Default",layout_minimal:"Minimal",height:"Altura",show_feels_like:"Sensación térmica",show_wind:"Viento",show_wind_gust:"Ráfagas",show_wind_direction:"Dirección",show_humidity:"Humedad",show_min_temp:"Temperatura mínima",show_hourly_forecast:"Pronóstico por horas",hourly_forecast_hours:"Horas",hourly_forecast_step:"Cada",hourly_forecast_chart:"Gráfico de temperatura",show_daily_forecast:"Pronóstico diario",daily_forecast_days:"Días",show_sunrise_sunset:"Amanecer y atardecer",sunrise_entity:"Sensor de amanecer",sunset_entity:"Sensor de atardecer",show_clock:"Reloj",clock_position:"Posición",clock_position_top:"Arriba",clock_position_details:"Detalles",clock_format:"Formato",clock_format_12h:"12 horas (AM/PM)",clock_format_24h:"24 horas",overlay_opacity:"Oscurecimiento",text_shadow:"Sombra del texto",language:"Idioma",language_auto:"Automático",language_en:"Inglés",language_ru:"Ruso",language_de:"Alemán",language_nl:"Neerlandés",language_fr:"Francés",language_es:"Español",language_it:"Italiano",language_sk:"Eslovaco",language_hu:"Húngaro",language_pt:"Portugués",wind_speed_unit:"Unidad de velocidad del viento",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (como la integración)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knots",wind_speed_unit_helper:"Auto mantiene la unidad de la integración o del sensor de viento; las demás convierten todo el viento de la tarjeta",show_animations:"Animaciones",animation_quality:"Calidad de animación",animation_quality_helper:"Redúcela en tabletas de pared y dispositivos lentos",animation_quality_high:"Alta",animation_quality_low:"Baja (20 FPS, para dispositivos lentos)",animation_quality_medium:"Media (30 FPS, menos partículas)",aqi_entity:"Sensor de calidad del aire (AQI)",border_radius:"Radio de las esquinas",daily_forecast_title:"Título",daily_forecast_title_helper:"Vacío = título predeterminado",dew_point_entity:"Sensor de punto de rocío",feels_like_entity:"Sensor de sensación térmica",hourly_forecast_title:"Título",hourly_forecast_title_helper:"Vacío = título predeterminado",humidity_entity:"Sensor de humedad",overlay_opacity_helper:"0–1, oscurece el cielo para que el texto se lea bien",precipitation_entity:"Sensor de precipitación",pressure_entity:"Sensor de presión",section_appearance:"Apariencia",section_clock:"Idioma, reloj y fecha",section_details:"Detalles",section_forecast:"Pronóstico",section_sensors:"Sensores (opcional)",sensors:"Sensores (opcional, sustituyen a la entidad meteorológica)",show_aurora:"Aurora boreal",show_aurora_helper:"En noches despejadas, gráficos modernos",show_date:"Fecha",show_dew_point:"Punto de rocío",show_precipitation_outlook:"Cuándo empieza/termina la lluvia",show_precipitation_outlook_helper:"Según el pronóstico por horas de las próximas 12 horas",show_pressure:"Presión",show_raindrops:"Gotas de lluvia en el cristal",show_raindrops_helper:"Con lluvia, gráficos modernos",show_temperature_bars:"Barras de temperatura",show_forecast_wind:"Viento en los pronósticos",show_forecast_wind_helper:"Dirección, velocidad y rachas para cada hora y cada día, si el proveedor del tiempo las ofrece",hourly_forecast_step_helper:"Mostrar el pronóstico cada pocas horas, p. ej. 3 para 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Una curva de temperatura en lugar de números, con la probabilidad de precipitación en barras",show_forecast_description:"Pronóstico en texto",show_forecast_description_helper:"El pronóstico escrito del proveedor del tiempo, si lo ofrece (p. ej. el National Weather Service de EE. UU.)",show_uv_index:"Índice UV",show_wind_effects:"Ráfagas y hojas",show_wind_effects_helper:"Con viento o por encima de 8 m/s",sun_position_x:"Posición del sol/luna, horizontal",sun_position_x_helper:"Déjalo vacío para seguir la hora del día",sun_position_y:"Posición del sol/luna, vertical",sun_position_y_helper:"Déjalo vacío para seguir la hora del día",temperature_entity:"Sensor de temperatura",text_color:"Color del texto",text_color_helper:"Cualquier color CSS, p. ej. #1a1a2e o var(--primary-text-color)",uv_index_entity:"Sensor de índice UV",visual_style:"Gráficos",visual_style_classic:"Clásico",visual_style_modern:"Moderno",wind_bearing_entity:"Sensor de dirección del viento",wind_gust_entity:"Sensor de ráfagas",wind_speed_entity:"Sensor de velocidad del viento",language_da:"Danés",language_nb:"Noruego (bokmål)",language_pl:"Polaco",language_sl:"Esloveno",language_sr:"Serbio",language_tr:"Turco",language_zh:"Chino",hourly_forecast_hours_helper:"Sin límite: p. ej. 72 para tres días, o más para mostrar todo el pronóstico del proveedor"}};var mi={sunny:"Päikeseline",clear:"Pilvitu",overcast:"Lauspilves",cloudy:"Pilves",partlycloudy:"Vahelduv pilvisus",rainy:"Vihmane",rain:"Vihm",snowy:"Lumine",snow:"Lumi",foggy:"Udune",fog:"Udu",windy:"Tuuline","windy-variant":"Tuuline, pilves",lightning:"Äike","lightning-rainy":"Äikesevihm",pouring:"Paduvihm","snowy-rainy":"Lörts",hail:"Rahe","clear-night":"Selge öö",feels_like:"Tundub nagu",forecast_title:"Tänane prognoos",forecast_title_hourly:"Tunniprognoos",daily_forecast_title:"Päevaprognoos",no_data:"Andmed puuduvad",forecast_unavailable:"Prognoos pole saadaval",weather:"Ilm",language:"Keel",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"sõlme",wind_unit_fts:"ft/s",show_clock:"Näita praegust kellaaega",am:"AM",pm:"PM",pressure:"Õhurõhk",uv_index:"UV-indeks",dew_point:"Kastepunkt",aqi:"Õhukvaliteedi indeks",precipitation_outlook:{start:"{kind}: algab umbes {time}",soon:"{kind}: algab peagi",stop:"{kind}: lõpeb umbes {time}",continues:"{kind}: veel vähemalt {hours} h",rain:"Vihm",snow:"Lumi",sleet:"Lörts",hail:"Rahe",storm:"Äike"},editor:{entity:"Ilmaolem",name:"Kaardi pealkiri",layout:"Paigutus",layout_default:"Vaikimisi",layout_minimal:"Minimaalne",visual_style:"Graafika",visual_style_modern:"Moodne",visual_style_classic:"Klassikaline",animation_quality:"Animatsiooni kvaliteet",animation_quality_high:"Kõrge",animation_quality_medium:"Keskmine (30 FPS, vähem osakesi)",animation_quality_low:"Madal (20 FPS, aeglastele seadmetele)",height:"Kõrgus",show_feels_like:"Tundub nagu",show_wind:"Tuul",show_wind_gust:"Puhangud",show_wind_direction:"Suund",show_humidity:"Niiskus",show_min_temp:"Miinimumtemperatuur",show_hourly_forecast:"Tunniprognoos",hourly_forecast_hours:"Tunnid",hourly_forecast_step:"Iga",hourly_forecast_chart:"Temperatuurigraafik",hourly_forecast_title:"Pealkiri",show_daily_forecast:"Päevaprognoos",daily_forecast_days:"Päevad",daily_forecast_title:"Pealkiri",show_sunrise_sunset:"Päikesetõus ja -loojang",sunrise_entity:"Päikesetõusu andur",sunset_entity:"Päikeseloojangu andur",sensors:"Andurid (valikuline, asendavad ilmaolemit)",temperature_entity:"Temperatuuriandur",feels_like_entity:"Tajutava temperatuuri andur",humidity_entity:"Niiskusandur",wind_speed_entity:"Tuulekiiruse andur",wind_gust_entity:"Tuulepuhangute andur",wind_bearing_entity:"Tuulesuuna andur",precipitation_entity:"Sademeteandur",show_pressure:"Õhurõhk",show_uv_index:"UV-indeks",show_dew_point:"Kastepunkt",show_precipitation_outlook:"Millal vihm algab/lõpeb",show_temperature_bars:"Temperatuuriribad",show_forecast_wind:"Tuul prognoosides",show_forecast_wind_helper:"Iga tunni ja päeva tuule suund, kiirus ja puhangud, kui ilmateenus neid edastab",hourly_forecast_step_helper:"Näita prognoosi iga paari tunni järel, nt 3 puhul 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Numbrite asemel temperatuurikõver ja sademete tõenäosus tulpadena",show_forecast_description:"Tekstiprognoos",show_forecast_description_helper:"Ilmateenuse kirjalik prognoos, kui see on olemas (nt USA National Weather Service)",pressure_entity:"Õhurõhu andur",uv_index_entity:"UV-indeksi andur",dew_point_entity:"Kastepunkti andur",aqi_entity:"Õhukvaliteedi andur (AQI)",show_clock:"Kell",show_date:"Kuupäev",clock_position:"Asukoht",clock_position_top:"Üleval",clock_position_details:"Üksikasjad",clock_format:"Vorming",clock_format_12h:"12-tunnine (AM/PM)",clock_format_24h:"24-tunnine",overlay_opacity:"Tumendus",text_shadow:"Teksti vari",text_color:"Teksti värv",border_radius:"Nurkade ümarus",sun_position_x:"Päikese/kuu asukoht, horisontaalne",sun_position_y:"Päikese/kuu asukoht, vertikaalne",language:"Keel",language_auto:"Automaatne",language_en:"Inglise",language_ru:"Vene",language_de:"Saksa",language_nl:"Hollandi",language_fr:"Prantsuse",language_es:"Hispaania",language_it:"Itaalia",language_sk:"Slovaki",language_hu:"Ungari",language_pt:"Portugali",language_da:"Taani",language_sr:"Serbia",language_pl:"Poola",language_zh:"Hiina",language_tr:"Türgi",language_nb:"Norra (bokmål)",language_sl:"Sloveeni",wind_speed_unit:"Tuulekiiruse ühik",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Automaatne (nagu integratsioonis)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"sõlme",wind_speed_unit_helper:"Automaatne kasutab integratsiooni või tuuleanduri ühikut; teised teisendavad kogu kaardi tuule",show_animations:"Animatsioonid",show_aurora:"Virmalised",section_appearance:"Välimus",section_details:"Üksikasjad",section_forecast:"Prognoos",section_clock:"Keel, kell ja kuupäev",section_sensors:"Andurid (valikuline)",animation_quality_helper:"Vähenda seinatahvelarvutitel ja aeglastel seadmetel",show_aurora_helper:"Selgetel öödel, moodne graafika",overlay_opacity_helper:"0–1, tumendab taevast, et tekst oleks loetav",text_color_helper:"Mis tahes CSS-värv, nt #1a1a2e või var(--primary-text-color)",sun_position_x_helper:"Jäta tühjaks, et järgida kellaaega",sun_position_y_helper:"Jäta tühjaks, et järgida kellaaega",show_precipitation_outlook_helper:"Järgmise 12 tunni tunniprognoosi põhjal",hourly_forecast_title_helper:"Tühi = vaikepealkiri",daily_forecast_title_helper:"Tühi = vaikepealkiri",show_raindrops:"Vihmapiisad klaasil",show_wind_effects:"Tuulepuhangud ja lehed",show_raindrops_helper:"Vihmaga, moodne graafika",show_wind_effects_helper:"Tuulise ilmaga või üle 8 m/s",hourly_forecast_hours_helper:"Ülempiirita: nt 72 kolme päeva jaoks või rohkem, et näidata pakkuja kogu prognoosi"}};var gi={sunny:"Ensoleillé",clear:"Dégagé",overcast:"Couvert",cloudy:"Nuageux",partlycloudy:"Partiellement nuageux",rainy:"Pluvieux",rain:"Pluie",snowy:"Neigeux",snow:"Neige",foggy:"Brumeux",fog:"Brouillard",lightning:"Éclairs","lightning-rainy":"Orage",pouring:"Forte pluie","snowy-rainy":"Neige fondue",hail:"Grêle","clear-night":"Nuit claire",windy:"Venteux","windy-variant":"Venteux, nuageux",feels_like:"Ressenti",forecast_title:"Prévisions du jour",forecast_title_hourly:"Prévisions horaires",daily_forecast_title:"Prévisions quotidiennes",no_data:"Aucune donnée",forecast_unavailable:"Prévisions non disponibles",weather:"Météo",language:"Langue",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knots",wind_unit_fts:"ft/s",show_clock:"Afficher l'heure actuelle",am:"AM",pm:"PM",pressure:"Pression",uv_index:"Indice UV",dew_point:"Point de rosée",aqi:"Indice de qualité de l'air",precipitation_outlook:{start:"{kind} : début vers {time}",soon:"{kind} : début imminent",stop:"{kind} : fin vers {time}",continues:"{kind} : encore au moins {hours} h",rain:"Pluie",snow:"Neige",sleet:"Neige fondue",hail:"Grêle",storm:"Orages"},editor:{entity:"Entité météo",name:"Titre de la carte",layout:"Mise en page",layout_default:"Default",layout_minimal:"Minimal",height:"Hauteur",show_feels_like:"Ressenti",show_wind:"Vent",show_wind_gust:"Rafales",show_wind_direction:"Direction",show_humidity:"Humidité",show_min_temp:"Température min.",show_hourly_forecast:"Prévisions horaires",hourly_forecast_hours:"Heures",hourly_forecast_step:"Toutes les",hourly_forecast_chart:"Graphique des températures",show_daily_forecast:"Prévisions quotidiennes",daily_forecast_days:"Jours",show_sunrise_sunset:"Lever et coucher du soleil",sunrise_entity:"Capteur de lever du soleil",sunset_entity:"Capteur de coucher du soleil",show_clock:"Horloge",clock_position:"Position",clock_position_top:"En haut",clock_position_details:"Détails",clock_format:"Format",clock_format_12h:"12 heures (AM/PM)",clock_format_24h:"24 heures",overlay_opacity:"Assombrissement",text_shadow:"Ombre du texte",language:"Langue",language_auto:"Auto",language_en:"Anglais",language_ru:"Russe",language_de:"Allemand",language_nl:"Néerlandais",language_fr:"Français",language_es:"Espagnol",language_it:"Italien",language_sk:"Slovaque",language_hu:"Hongrois",language_pt:"Portugais",wind_speed_unit:"Unité de vitesse du vent",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (comme l’intégration)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knots",wind_speed_unit_helper:"Auto garde l’unité de l’intégration ou du capteur de vent ; les autres convertissent tout le vent de la carte",show_animations:"Animations",animation_quality:"Qualité d'animation",animation_quality_helper:"À réduire pour les tablettes murales et les appareils lents",animation_quality_high:"Élevée",animation_quality_low:"Faible (20 FPS, pour appareils lents)",animation_quality_medium:"Moyenne (30 FPS, moins de particules)",aqi_entity:"Capteur de qualité de l'air (AQI)",border_radius:"Arrondi des coins",daily_forecast_title:"Titre",daily_forecast_title_helper:"Vide = titre par défaut",dew_point_entity:"Capteur de point de rosée",feels_like_entity:"Capteur de température ressentie",hourly_forecast_title:"Titre",hourly_forecast_title_helper:"Vide = titre par défaut",humidity_entity:"Capteur d'humidité",overlay_opacity_helper:"0–1, assombrit le ciel pour garder le texte lisible",precipitation_entity:"Capteur de précipitations",pressure_entity:"Capteur de pression",section_appearance:"Apparence",section_clock:"Langue, horloge et date",section_details:"Détails",section_forecast:"Prévisions",section_sensors:"Capteurs (facultatif)",sensors:"Capteurs (facultatif, remplacent l'entité météo)",show_aurora:"Aurore boréale",show_aurora_helper:"Par nuit claire, graphismes modernes",show_date:"Date",show_dew_point:"Point de rosée",show_precipitation_outlook:"Début/fin de la pluie",show_precipitation_outlook_helper:"D'après la prévision horaire des 12 prochaines heures",show_pressure:"Pression",show_raindrops:"Gouttes de pluie sur la vitre",show_raindrops_helper:"Sous la pluie, graphismes modernes",show_temperature_bars:"Barres de température",show_forecast_wind:"Vent dans les prévisions",show_forecast_wind_helper:"Direction, vitesse et rafales pour chaque heure et chaque jour, si le fournisseur météo les fournit",hourly_forecast_step_helper:"Afficher la prévision toutes les quelques heures, p. ex. 3 pour 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Une courbe de température au lieu des chiffres, avec la probabilité de précipitations en barres",show_forecast_description:"Prévision textuelle",show_forecast_description_helper:"La prévision rédigée du fournisseur météo, s’il en propose une (p. ex. le National Weather Service américain)",show_uv_index:"Indice UV",show_wind_effects:"Rafales et feuilles",show_wind_effects_helper:"Par temps venteux ou au-delà de 8 m/s",sun_position_x:"Position du soleil/de la lune, horizontale",sun_position_x_helper:"Laisser vide pour suivre l'heure de la journée",sun_position_y:"Position du soleil/de la lune, verticale",sun_position_y_helper:"Laisser vide pour suivre l'heure de la journée",temperature_entity:"Capteur de température",text_color:"Couleur du texte",text_color_helper:"Toute couleur CSS, p. ex. #1a1a2e ou var(--primary-text-color)",uv_index_entity:"Capteur d'indice UV",visual_style:"Graphismes",visual_style_classic:"Classique",visual_style_modern:"Moderne",wind_bearing_entity:"Capteur de direction du vent",wind_gust_entity:"Capteur de rafales",wind_speed_entity:"Capteur de vitesse du vent",language_da:"Danois",language_nb:"Norvégien (bokmål)",language_pl:"Polonais",language_sl:"Slovène",language_sr:"Serbe",language_tr:"Turc",language_zh:"Chinois",hourly_forecast_hours_helper:"Sans limite : p. ex. 72 pour trois jours, ou plus pour afficher toute la prévision du fournisseur"}};var fi={sunny:"Napos",clear:"Derült",overcast:"Borult",cloudy:"Felhős",partlycloudy:"Részben felhős",rainy:"Esős",rain:"Eső",snowy:"Havas",snow:"Hó",foggy:"Ködös",fog:"Köd",lightning:"Villámlás","lightning-rainy":"Zivatar",pouring:"Heves eső","snowy-rainy":"Havas eső",hail:"Jégeső","clear-night":"Derült éj",windy:"Szeles","windy-variant":"Szeles, felhős",feels_like:"Hőérzet",forecast_title:"Mai előrejelzés",forecast_title_hourly:"Óránkénti előrejelzés",daily_forecast_title:"Napi előrejelzés",no_data:"Nincs adat",forecast_unavailable:"Előrejelzés nem elérhető",weather:"Időjárás",language:"Nyelv",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"csomó",wind_unit_fts:"ft/s",show_clock:"Aktuális idő mutatása",am:"DE",pm:"DU",pressure:"Légnyomás",uv_index:"UV-index",dew_point:"Harmatpont",aqi:"Levegőminőségi index",precipitation_outlook:{start:"{kind} várható {time} körül",soon:"{kind} hamarosan várható",stop:"{kind} {time} körül eláll",continues:"{kind} még legalább {hours} órán át",rain:"Eső",snow:"Hó",sleet:"Havas eső",hail:"Jégeső",storm:"Zivatar"},editor:{entity:"Időjárás entitás",name:"Kártya címe",layout:"Elrendezés",layout_default:"Default",layout_minimal:"Minimal",height:"Magasság",show_feels_like:"Hőérzet",show_wind:"Szél",show_wind_gust:"Széllökések",show_wind_direction:"Irány",show_humidity:"Páratartalom",show_min_temp:"Minimum hőmérséklet",show_hourly_forecast:"Óránkénti előrejelzés",hourly_forecast_hours:"Órák",hourly_forecast_step:"Lépés",hourly_forecast_chart:"Hőmérséklet-grafikon",show_daily_forecast:"Napi előrejelzés",daily_forecast_days:"Napok",show_sunrise_sunset:"Napkelte és napnyugta",sunrise_entity:"Napkelte-érzékelő",sunset_entity:"Napnyugta-érzékelő",show_clock:"Óra",clock_position:"Helyzet",clock_position_top:"Felül",clock_position_details:"Részletek",clock_format:"Formátum",clock_format_12h:"12 órás (DE/DU)",clock_format_24h:"24 órás",overlay_opacity:"Sötétítés",text_shadow:"Szövegárnyék",language:"Nyelv",language_auto:"Automatikus",language_en:"Angol",language_ru:"Orosz",language_de:"Német",language_nl:"Holland",language_fr:"Francia",language_es:"Spanyol",language_it:"Olasz",language_hu:"Magyar",language_sk:"Szlovák",language_pt:"Portugál",wind_speed_unit:"Szélsebesség mértékegysége",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Automatikus (mint az integráció)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"csomó",wind_speed_unit_helper:"Az automatikus az integráció vagy a szélérzékelő mértékegységét használja; a többi átváltja a kártya összes szélértékét",show_animations:"Animációk",animation_quality:"Animáció minősége",animation_quality_helper:"Fali tableteken és lassú eszközökön csökkentse",animation_quality_high:"Magas",animation_quality_low:"Alacsony (20 FPS, lassú eszközökhöz)",animation_quality_medium:"Közepes (30 FPS, kevesebb részecske)",aqi_entity:"Levegőminőség-érzékelő (AQI)",border_radius:"Sarkok lekerekítése",daily_forecast_title:"Cím",daily_forecast_title_helper:"Üres = alapértelmezett cím",dew_point_entity:"Harmatpont-érzékelő",feels_like_entity:"Hőérzet-érzékelő",hourly_forecast_title:"Cím",hourly_forecast_title_helper:"Üres = alapértelmezett cím",humidity_entity:"Páratartalom-érzékelő",overlay_opacity_helper:"0–1, sötétíti az eget, hogy a szöveg olvasható maradjon",precipitation_entity:"Csapadékérzékelő",pressure_entity:"Légnyomás-érzékelő",section_appearance:"Megjelenés",section_clock:"Nyelv, óra és dátum",section_details:"Részletek",section_forecast:"Előrejelzés",section_sensors:"Érzékelők (opcionális)",sensors:"Érzékelők (opcionális, felülírják az időjárás-entitást)",show_aurora:"Sarki fény",show_aurora_helper:"Derült éjszakákon, modern grafika",show_date:"Dátum",show_dew_point:"Harmatpont",show_precipitation_outlook:"Mikor kezd/áll el az eső",show_precipitation_outlook_helper:"Az óránkénti előrejelzésből, a következő 12 órára",show_pressure:"Légnyomás",show_raindrops:"Esőcseppek az üvegen",show_raindrops_helper:"Esőben, modern grafika",show_temperature_bars:"Hőmérséklet-sávok",show_forecast_wind:"Szél az előrejelzésekben",show_forecast_wind_helper:"Irány, sebesség és széllökések óránként és naponként, ha az időjárás-szolgáltató megadja őket",hourly_forecast_step_helper:"Az előrejelzés néhány óránként, pl. 3 esetén 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Hőmérsékleti görbe számok helyett, a csapadék valószínűségével oszlopokként",show_forecast_description:"Szöveges előrejelzés",show_forecast_description_helper:"Az időjárás-szolgáltató írásos előrejelzése, ha van (pl. az amerikai National Weather Service)",show_uv_index:"UV-index",show_wind_effects:"Széllökések és levelek",show_wind_effects_helper:"Szeles időben vagy 8 m/s felett",sun_position_x:"Nap/Hold helyzete, vízszintesen",sun_position_x_helper:"Hagyja üresen, hogy a napszakot kövesse",sun_position_y:"Nap/Hold helyzete, függőlegesen",sun_position_y_helper:"Hagyja üresen, hogy a napszakot kövesse",temperature_entity:"Hőmérséklet-érzékelő",text_color:"Szövegszín",text_color_helper:"Bármilyen CSS-szín, pl. #1a1a2e vagy var(--primary-text-color)",uv_index_entity:"UV-index-érzékelő",visual_style:"Grafika",visual_style_classic:"Klasszikus",visual_style_modern:"Modern",wind_bearing_entity:"Szélirány-érzékelő",wind_gust_entity:"Széllökés-érzékelő",wind_speed_entity:"Szélsebesség-érzékelő",language_da:"Dán",language_nb:"Norvég (bokmål)",language_pl:"Lengyel",language_sl:"Szlovén",language_sr:"Szerb",language_tr:"Török",language_zh:"Kínai",hourly_forecast_hours_helper:"Nincs felső határ: pl. 72 három napra, vagy több a szolgáltató teljes előrejelzéséhez"}};var yi={sunny:"Soleggiato",clear:"Sereno",overcast:"Coperto",cloudy:"Nuvoloso",partlycloudy:"Parzialmente Nuvoloso",rainy:"Piovoso",rain:"Pioggia",snowy:"Nevoso",snow:"Neve",foggy:"Nebbia",fog:"Nebbia",lightning:"Fulmine","lightning-rainy":"Temporale",pouring:"Pioggia Intensa","snowy-rainy":"Nevischio",hail:"Grandine","clear-night":"Notte Serena",windy:"Ventoso","windy-variant":"Ventoso, nuvoloso",feels_like:"Percepita",forecast_title:"Previsioni di oggi",forecast_title_hourly:"Previsioni orarie",daily_forecast_title:"Previsioni Giornaliere",no_data:"Nessun dato",forecast_unavailable:"Previsioni non disponibili",weather:"Meteo",language:"Lingua",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knots",wind_unit_fts:"ft/s",show_clock:"Mostra ora corrente",am:"AM",pm:"PM",pressure:"Pressione",uv_index:"Indice UV",dew_point:"Punto di rugiada",aqi:"Indice di qualità dell'aria",precipitation_outlook:{start:"{kind}: inizio verso {time}",soon:"{kind}: inizio a breve",stop:"{kind}: fine verso {time}",continues:"{kind}: ancora almeno {hours} h",rain:"Pioggia",snow:"Neve",sleet:"Nevischio",hail:"Grandine",storm:"Temporali"},editor:{entity:"Entità meteo",name:"Titolo della scheda",layout:"Layout",layout_default:"Default",layout_minimal:"Minimal",height:"Altezza",show_feels_like:"Percepita",show_wind:"Vento",show_wind_gust:"Raffiche",show_wind_direction:"Direzione",show_humidity:"Umidità",show_min_temp:"Temperatura minima",show_hourly_forecast:"Previsioni orarie",hourly_forecast_hours:"Ore",hourly_forecast_step:"Ogni",hourly_forecast_chart:"Grafico della temperatura",show_daily_forecast:"Previsioni giornaliere",daily_forecast_days:"Giorni",show_sunrise_sunset:"Alba e tramonto",sunrise_entity:"Sensore alba",sunset_entity:"Sensore tramonto",show_clock:"Orologio",clock_position:"Posizione",clock_position_top:"In alto",clock_position_details:"Dettagli",clock_format:"Formato",clock_format_12h:"12 ore (AM/PM)",clock_format_24h:"24 ore",overlay_opacity:"Oscuramento",text_shadow:"Ombra del testo",language:"Lingua",language_auto:"Auto",language_en:"Inglese",language_ru:"Russo",language_de:"Tedesco",language_nl:"Olandese",language_fr:"Francese",language_es:"Spagnolo",language_it:"Italiano",language_sk:"Slovacco",language_hu:"Ungherese",language_pt:"Portoghese",wind_speed_unit:"Unità velocità del vento",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (come l’integrazione)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knots",wind_speed_unit_helper:"Auto mantiene l’unità dell’integrazione o del sensore del vento; le altre convertono tutto il vento della scheda",show_animations:"Animazioni",animation_quality:"Qualità animazione",animation_quality_helper:"Riducila su tablet a parete e dispositivi lenti",animation_quality_high:"Alta",animation_quality_low:"Bassa (20 FPS, per dispositivi lenti)",animation_quality_medium:"Media (30 FPS, meno particelle)",aqi_entity:"Sensore qualità dell'aria (AQI)",border_radius:"Raggio degli angoli",daily_forecast_title:"Titolo",daily_forecast_title_helper:"Vuoto = titolo predefinito",dew_point_entity:"Sensore punto di rugiada",feels_like_entity:"Sensore temperatura percepita",hourly_forecast_title:"Titolo",hourly_forecast_title_helper:"Vuoto = titolo predefinito",humidity_entity:"Sensore umidità",overlay_opacity_helper:"0–1, scurisce il cielo per mantenere il testo leggibile",precipitation_entity:"Sensore precipitazioni",pressure_entity:"Sensore pressione",section_appearance:"Aspetto",section_clock:"Lingua, orologio e data",section_details:"Dettagli",section_forecast:"Previsioni",section_sensors:"Sensori (facoltativi)",sensors:"Sensori (facoltativi, sostituiscono l'entità meteo)",show_aurora:"Aurora boreale",show_aurora_helper:"Nelle notti serene, grafica moderna",show_date:"Data",show_dew_point:"Punto di rugiada",show_precipitation_outlook:"Quando inizia/finisce la pioggia",show_precipitation_outlook_helper:"Dalle previsioni orarie delle prossime 12 ore",show_pressure:"Pressione",show_raindrops:"Gocce di pioggia sul vetro",show_raindrops_helper:"Con la pioggia, grafica moderna",show_temperature_bars:"Barre della temperatura",show_forecast_wind:"Vento nelle previsioni",show_forecast_wind_helper:"Direzione, velocità e raffiche per ogni ora e ogni giorno, se il servizio meteo le fornisce",hourly_forecast_step_helper:"Mostra la previsione ogni qualche ora, ad es. 3 per 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Una curva della temperatura al posto dei numeri, con la probabilità di precipitazioni a barre",show_forecast_description:"Previsione testuale",show_forecast_description_helper:"La previsione scritta del servizio meteo, se disponibile (ad es. il National Weather Service statunitense)",show_uv_index:"Indice UV",show_wind_effects:"Raffiche e foglie",show_wind_effects_helper:"Con tempo ventoso o oltre 8 m/s",sun_position_x:"Posizione sole/luna, orizzontale",sun_position_x_helper:"Lascia vuoto per seguire l'ora del giorno",sun_position_y:"Posizione sole/luna, verticale",sun_position_y_helper:"Lascia vuoto per seguire l'ora del giorno",temperature_entity:"Sensore temperatura",text_color:"Colore del testo",text_color_helper:"Qualsiasi colore CSS, ad es. #1a1a2e o var(--primary-text-color)",uv_index_entity:"Sensore indice UV",visual_style:"Grafica",visual_style_classic:"Classica",visual_style_modern:"Moderna",wind_bearing_entity:"Sensore direzione del vento",wind_gust_entity:"Sensore raffiche",wind_speed_entity:"Sensore velocità del vento",language_da:"Danese",language_nb:"Norvegese (bokmål)",language_pl:"Polacco",language_sl:"Sloveno",language_sr:"Serbo",language_tr:"Turco",language_zh:"Cinese",hourly_forecast_hours_helper:"Nessun limite: ad es. 72 per tre giorni, o di più per mostrare tutte le previsioni del fornitore"}};var wi={sunny:"Sol",clear:"Klart",overcast:"Overskyet",cloudy:"Skyet",partlycloudy:"Delvis skyet",rainy:"Regn",rain:"Regn",snowy:"Snø",snow:"Snø",foggy:"Tåke",fog:"Tåke",lightning:"Lyn","lightning-rainy":"Tordenvær",pouring:"Kraftig regn","snowy-rainy":"Sludd",hail:"Hagl","clear-night":"Klar natt",windy:"Vindfullt","windy-variant":"Vindfullt, skyet",feels_like:"Føles som",forecast_title:"Dagens værvarsel",forecast_title_hourly:"Timevarsel",daily_forecast_title:"Daglig værvarsel",no_data:"Ingen data",forecast_unavailable:"Værvarsel utilgjengelig",weather:"Vær",language:"Språk",wind_unit_kmh:"km/t",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knop",wind_unit_fts:"ft/s",show_clock:"Vis gjeldende klokkeslett",am:"AM",pm:"PM",pressure:"Lufttrykk",uv_index:"UV-indeks",dew_point:"Duggpunkt",aqi:"Luftkvalitetsindeks",precipitation_outlook:{start:"{kind} ventes rundt {time}",soon:"{kind} ventes snart",stop:"{kind} slutter rundt {time}",continues:"{kind} i minst {hours} timer til",rain:"Regn",snow:"Snø",sleet:"Sludd",hail:"Hagl",storm:"Tordenvær"},editor:{entity:"Værentitet",name:"Korttittel",layout:"Oppsett",layout_default:"Standard",layout_minimal:"Minimal",height:"Høyde",show_feels_like:"Føles som",show_wind:"Vind",show_wind_gust:"Vindkast",show_wind_direction:"Retning",show_humidity:"Luftfuktighet",show_min_temp:"Min. temperatur",show_hourly_forecast:"Timevarsel",hourly_forecast_hours:"Timer",hourly_forecast_step:"Hver",hourly_forecast_chart:"Temperaturgraf",show_daily_forecast:"Døgnvarsel",daily_forecast_days:"Dager",show_sunrise_sunset:"Soloppgang og solnedgang",sunrise_entity:"Soloppgangssensor",sunset_entity:"Solnedgangssensor",show_clock:"Klokke",clock_position:"Plassering",clock_position_top:"Øverst",clock_position_details:"Detaljer",clock_format:"Format",clock_format_12h:"12-timers (AM/PM)",clock_format_24h:"24-timers",overlay_opacity:"Mørklegging",text_shadow:"Tekstskygge",language:"Språk",language_auto:"Automatisk",language_en:"Engelsk",language_ru:"Russisk",language_de:"Tysk",language_nl:"Nederlandsk",language_fr:"Fransk",language_es:"Spansk",language_it:"Italiensk",language_sk:"Slovakisk",language_hu:"Ungarsk",language_pt:"Portugisisk",language_da:"Dansk",language_sr:"Serbisk",language_pl:"Polsk",language_zh:"Kinesisk",language_tr:"Tyrkisk",language_nb:"Norsk (bokmål)",wind_speed_unit:"Enhet for vindhastighet",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/t",wind_speed_unit_auto:"Auto (som integrasjonen)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knop",wind_speed_unit_helper:"Auto beholder enheten til integrasjonen eller vindsensoren; de andre regner om all vind på kortet",show_animations:"Animasjoner",animation_quality:"Animasjonskvalitet",animation_quality_helper:"Senk den på veggnettbrett og trege enheter",animation_quality_high:"Høy",animation_quality_low:"Lav (20 FPS, for trege enheter)",animation_quality_medium:"Middels (30 FPS, færre partikler)",aqi_entity:"Luftkvalitetssensor (AQI)",border_radius:"Hjørneradius",daily_forecast_title:"Tittel",daily_forecast_title_helper:"Tom = standardtittel",dew_point_entity:"Duggpunktsensor",feels_like_entity:"Sensor for føles som",hourly_forecast_title:"Tittel",hourly_forecast_title_helper:"Tom = standardtittel",humidity_entity:"Luftfuktighetssensor",overlay_opacity_helper:"0–1, gjør himmelen mørkere slik at teksten er lett å lese",precipitation_entity:"Nedbørsensor",pressure_entity:"Lufttrykksensor",section_appearance:"Utseende",section_clock:"Språk, klokke og dato",section_details:"Detaljer",section_forecast:"Varsel",section_sensors:"Sensorer (valgfritt)",sensors:"Sensorer (valgfritt, erstatter værenheten)",show_aurora:"Nordlys",show_aurora_helper:"I klare netter, moderne grafikk",show_date:"Dato",show_dew_point:"Duggpunkt",show_precipitation_outlook:"Når regnet starter/slutter",show_precipitation_outlook_helper:"Fra timevarselet for de neste 12 timene",show_pressure:"Lufttrykk",show_raindrops:"Regndråper på ruten",show_raindrops_helper:"I regnvær, moderne grafikk",show_temperature_bars:"Temperaturstolper",show_forecast_wind:"Vind i varslene",show_forecast_wind_helper:"Retning, hastighet og vindkast for hver time og dag, hvis værtjenesten oppgir dem",hourly_forecast_step_helper:"Vis varselet med noen timers mellomrom, f.eks. 3 for 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"En temperaturkurve i stedet for tall, med sannsynligheten for nedbør som søyler",show_forecast_description:"Tekstvarsel",show_forecast_description_helper:"Værtjenestens skrevne varsel, hvis den har et (f.eks. amerikanske National Weather Service)",show_uv_index:"UV-indeks",show_wind_effects:"Vindkast og blader",show_wind_effects_helper:"I vindfullt vær eller over 8 m/s",sun_position_x:"Sol/måne-posisjon, vannrett",sun_position_x_helper:"La stå tomt for å følge tiden på døgnet",sun_position_y:"Sol/måne-posisjon, loddrett",sun_position_y_helper:"La stå tomt for å følge tiden på døgnet",temperature_entity:"Temperatursensor",text_color:"Tekstfarge",text_color_helper:"Hvilken som helst CSS-farge, f.eks. #1a1a2e eller var(--primary-text-color)",uv_index_entity:"UV-indekssensor",visual_style:"Grafikk",visual_style_classic:"Klassisk",visual_style_modern:"Moderne",wind_bearing_entity:"Vindretningssensor",wind_gust_entity:"Vindkastsensor",wind_speed_entity:"Vindhastighetssensor",language_sl:"Slovensk",hourly_forecast_hours_helper:"Ingen øvre grense: f.eks. 72 for tre dager, eller mer for å vise hele varselet fra leverandøren"}};var vi={sunny:"Zonnig",clear:"Helder",overcast:"Bewolkt",cloudy:"Bewolkt",partlycloudy:"Gedeeltelijk bewolkt",rainy:"Regenachtig",rain:"Regen",snowy:"Sneeuwachtig",snow:"Sneeuw",foggy:"Mistig",fog:"Mist",lightning:"Bliksem","lightning-rainy":"Onweersbui",pouring:"Zware regen","snowy-rainy":"Natte sneeuw",hail:"Hagel","clear-night":"Heldere nacht",windy:"Winderig","windy-variant":"Winderig, bewolkt",feels_like:"Gevoelstemperatuur",forecast_title:"Voorspelling van vandaag",forecast_title_hourly:"Uurverwachting",daily_forecast_title:"Dagelijkse voorspelling",no_data:"Geen gegevens",forecast_unavailable:"Voorspelling niet beschikbaar",weather:"Weer",language:"Taal",wind_unit_kmh:"km/u",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knots",wind_unit_fts:"ft/s",show_clock:"Huidige tijd weergeven",am:"AM",pm:"PM",pressure:"Luchtdruk",uv_index:"UV-index",dew_point:"Dauwpunt",aqi:"Luchtkwaliteitsindex",precipitation_outlook:{start:"{kind} verwacht rond {time}",soon:"{kind} binnenkort verwacht",stop:"{kind} stopt rond {time}",continues:"{kind} nog minstens {hours} uur",rain:"Regen",snow:"Sneeuw",sleet:"Natte sneeuw",hail:"Hagel",storm:"Onweer"},editor:{entity:"Weer-entiteit",name:"Kaarttitel",layout:"Indeling",layout_default:"Default",layout_minimal:"Minimal",height:"Hoogte",show_feels_like:"Gevoelstemperatuur",show_wind:"Wind",show_wind_gust:"Windstoten",show_wind_direction:"Richting",show_humidity:"Luchtvochtigheid",show_min_temp:"Minimumtemperatuur",show_hourly_forecast:"Uurverwachting",hourly_forecast_hours:"Uren",hourly_forecast_step:"Elke",hourly_forecast_chart:"Temperatuurgrafiek",show_daily_forecast:"Dagverwachting",daily_forecast_days:"Dagen",show_sunrise_sunset:"Zonsopkomst en -ondergang",sunrise_entity:"Zonsopkomstsensor",sunset_entity:"Zonsondergangsensor",show_clock:"Klok",clock_position:"Positie",clock_position_top:"Boven",clock_position_details:"Details",clock_format:"Notatie",clock_format_12h:"12-uurs (AM/PM)",clock_format_24h:"24-uurs",overlay_opacity:"Verduistering",text_shadow:"Tekstschaduw",language:"Taal",language_auto:"Automatisch",language_en:"Engels",language_ru:"Russisch",language_de:"Duits",language_nl:"Nederlands",language_fr:"Frans",language_es:"Spaans",language_it:"Italiaans",language_sk:"Slowaaks",language_hu:"Hongaars",language_pt:"Portugees",wind_speed_unit:"Eenheid windsnelheid",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/u",wind_speed_unit_auto:"Auto (zoals de integratie)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knots",wind_speed_unit_helper:"Auto houdt de eenheid van de integratie of windsensor aan; de andere rekenen alle wind op de kaart om",show_animations:"Animaties",animation_quality:"Animatiekwaliteit",animation_quality_helper:"Verlaag dit voor wandtablets en trage apparaten",animation_quality_high:"Hoog",animation_quality_low:"Laag (20 FPS, voor trage apparaten)",animation_quality_medium:"Gemiddeld (30 FPS, minder deeltjes)",aqi_entity:"Luchtkwaliteitssensor (AQI)",border_radius:"Hoekafronding",daily_forecast_title:"Titel",daily_forecast_title_helper:"Leeg = standaardtitel",dew_point_entity:"Dauwpuntsensor",feels_like_entity:"Gevoelstemperatuursensor",hourly_forecast_title:"Titel",hourly_forecast_title_helper:"Leeg = standaardtitel",humidity_entity:"Luchtvochtigheidssensor",overlay_opacity_helper:"0–1, maakt de lucht donkerder zodat tekst leesbaar blijft",precipitation_entity:"Neerslagsensor",pressure_entity:"Luchtdruksensor",section_appearance:"Uiterlijk",section_clock:"Taal, klok en datum",section_details:"Details",section_forecast:"Verwachting",section_sensors:"Sensoren (optioneel)",sensors:"Sensoren (optioneel, vervangen de weerentiteit)",show_aurora:"Noorderlicht",show_aurora_helper:"Bij heldere nachten, moderne grafiek",show_date:"Datum",show_dew_point:"Dauwpunt",show_precipitation_outlook:"Wanneer regen begint/stopt",show_precipitation_outlook_helper:"Uit de uurverwachting voor de komende 12 uur",show_pressure:"Luchtdruk",show_raindrops:"Regendruppels op het glas",show_raindrops_helper:"Bij regen, moderne grafiek",show_temperature_bars:"Temperatuurbalken",show_forecast_wind:"Wind in voorspellingen",show_forecast_wind_helper:"Richting, snelheid en windstoten per uur en per dag, als de weerdienst ze levert",hourly_forecast_step_helper:"Toon de voorspelling om de paar uur, bijv. 3 voor 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Een temperatuurcurve in plaats van getallen, met de neerslagkans als balken",show_forecast_description:"Tekstvoorspelling",show_forecast_description_helper:"De geschreven voorspelling van de weerdienst, als die er is (bijv. de Amerikaanse National Weather Service)",show_uv_index:"UV-index",show_wind_effects:"Windstoten en bladeren",show_wind_effects_helper:"Bij winderig weer of boven 8 m/s",sun_position_x:"Positie zon/maan, horizontaal",sun_position_x_helper:"Leeg laten om het tijdstip van de dag te volgen",sun_position_y:"Positie zon/maan, verticaal",sun_position_y_helper:"Leeg laten om het tijdstip van de dag te volgen",temperature_entity:"Temperatuursensor",text_color:"Tekstkleur",text_color_helper:"Elke CSS-kleur, bijv. #1a1a2e of var(--primary-text-color)",uv_index_entity:"UV-indexsensor",visual_style:"Grafiek",visual_style_classic:"Klassiek",visual_style_modern:"Modern",wind_bearing_entity:"Windrichtingsensor",wind_gust_entity:"Windstotensensor",wind_speed_entity:"Windsnelheidsensor",language_da:"Deens",language_nb:"Noors (Bokmål)",language_pl:"Pools",language_sl:"Sloveens",language_sr:"Servisch",language_tr:"Turks",language_zh:"Chinees",hourly_forecast_hours_helper:"Geen maximum: bijv. 72 voor drie dagen, of meer om de hele verwachting van de provider te tonen"}};var ki={sunny:"Słonecznie",clear:"Bezchmurnie",overcast:"Pochmurno",cloudy:"Zachmurzenie",partlycloudy:"Częściowe zachmurzenie",rainy:"Deszczowo",rain:"Deszcz",snowy:"Śnieżnie",snow:"Śnieg",foggy:"Mgliście",fog:"Mgła",lightning:"Błyskawice","lightning-rainy":"Burza",pouring:"Ulewa","snowy-rainy":"Deszcz ze śniegiem",hail:"Grad","clear-night":"Bezchmurna noc",windy:"Wietrznie","windy-variant":"Wietrznie, pochmurno",feels_like:"Odczuwalnie",forecast_title:"Prognoza na dziś",forecast_title_hourly:"Prognoza godzinowa",daily_forecast_title:"Prognoza dzienna",no_data:"Brak danych",forecast_unavailable:"Prognoza niedostępna",weather:"Pogoda",language:"Język",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"węzły",wind_unit_fts:"ft/s",show_clock:"Pokaż aktualny czas",am:"AM",pm:"PM",pressure:"Ciśnienie",uv_index:"Indeks UV",dew_point:"Punkt rosy",aqi:"Indeks jakości powietrza",precipitation_outlook:{start:"{kind}: początek około {time}",soon:"{kind}: początek wkrótce",stop:"{kind}: koniec około {time}",continues:"{kind}: jeszcze co najmniej {hours} h",rain:"Deszcz",snow:"Śnieg",sleet:"Deszcz ze śniegiem",hail:"Grad",storm:"Burza"},editor:{entity:"Encja pogody",name:"Tytuł karty",layout:"Układ",layout_default:"Domyślny",layout_minimal:"Minimalny",height:"Wysokość",show_feels_like:"Odczuwalna",show_wind:"Wiatr",show_wind_gust:"Porywy",show_wind_direction:"Kierunek",show_humidity:"Wilgotność",show_min_temp:"Temperatura minimalna",show_hourly_forecast:"Prognoza godzinowa",hourly_forecast_hours:"Godziny",hourly_forecast_step:"Co",hourly_forecast_chart:"Wykres temperatury",show_daily_forecast:"Prognoza dzienna",daily_forecast_days:"Dni",show_sunrise_sunset:"Wschód i zachód słońca",sunrise_entity:"Czujnik wschodu słońca",sunset_entity:"Czujnik zachodu słońca",show_clock:"Zegar",clock_position:"Położenie",clock_position_top:"Góra",clock_position_details:"Szczegóły",clock_format:"Format",clock_format_12h:"12-godzinny (AM/PM)",clock_format_24h:"24-godzinny",overlay_opacity:"Przyciemnienie",language:"Język",language_auto:"Automatycznie",language_en:"Angielski",language_ru:"Rosyjski",language_de:"Niemiecki",language_nl:"Holenderski",language_fr:"Francuski",language_es:"Hiszpański",language_it:"Włoski",language_sk:"Słowacki",language_hu:"Węgierski",language_pl:"Polski",wind_speed_unit:"Jednostka prędkości wiatru",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (jak w integracji)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"węzły",wind_speed_unit_helper:"Auto zachowuje jednostkę integracji lub czujnika wiatru; pozostałe przeliczają cały wiatr na karcie",animation_quality:"Jakość animacji",animation_quality_helper:"Obniż na tabletach ściennych i wolnych urządzeniach",animation_quality_high:"Wysoka",animation_quality_low:"Niska (20 FPS, dla wolnych urządzeń)",animation_quality_medium:"Średnia (30 FPS, mniej cząsteczek)",aqi_entity:"Czujnik jakości powietrza (AQI)",border_radius:"Zaokrąglenie narożników",daily_forecast_title:"Tytuł",daily_forecast_title_helper:"Puste = tytuł domyślny",dew_point_entity:"Czujnik punktu rosy",feels_like_entity:"Czujnik temperatury odczuwalnej",hourly_forecast_title:"Tytuł",hourly_forecast_title_helper:"Puste = tytuł domyślny",humidity_entity:"Czujnik wilgotności",overlay_opacity_helper:"0–1, przyciemnia niebo, aby tekst był czytelny",precipitation_entity:"Czujnik opadów",pressure_entity:"Czujnik ciśnienia",section_appearance:"Wygląd",section_clock:"Język, zegar i data",section_details:"Szczegóły",section_forecast:"Prognoza",section_sensors:"Czujniki (opcjonalnie)",sensors:"Czujniki (opcjonalnie, zastępują encję pogody)",show_animations:"Animacje",show_aurora:"Zorza polarna",show_aurora_helper:"W pogodne noce, nowoczesna grafika",show_date:"Data",show_dew_point:"Punkt rosy",show_precipitation_outlook:"Kiedy zacznie/przestanie padać",show_precipitation_outlook_helper:"Na podstawie prognozy godzinowej na najbliższe 12 godzin",show_pressure:"Ciśnienie",show_raindrops:"Krople deszczu na szybie",show_raindrops_helper:"Podczas deszczu, nowoczesna grafika",show_temperature_bars:"Paski temperatury",show_forecast_wind:"Wiatr w prognozach",show_forecast_wind_helper:"Kierunek, prędkość i porywy dla każdej godziny i dnia, jeśli dostawca pogody je podaje",hourly_forecast_step_helper:"Pokazuj prognozę co kilka godzin, np. 3 dla 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Krzywa temperatury zamiast liczb, z prawdopodobieństwem opadów jako słupkami",show_forecast_description:"Prognoza tekstowa",show_forecast_description_helper:"Opisowa prognoza dostawcy pogody, jeśli ją udostępnia (np. amerykańska National Weather Service)",show_uv_index:"Indeks UV",show_wind_effects:"Porywy wiatru i liście",show_wind_effects_helper:"Przy wietrznej pogodzie lub powyżej 8 m/s",sun_position_x:"Położenie słońca/księżyca, w poziomie",sun_position_x_helper:"Pozostaw puste, aby podążać za porą dnia",sun_position_y:"Położenie słońca/księżyca, w pionie",sun_position_y_helper:"Pozostaw puste, aby podążać za porą dnia",temperature_entity:"Czujnik temperatury",text_color:"Kolor tekstu",text_color_helper:"Dowolny kolor CSS, np. #1a1a2e lub var(--primary-text-color)",text_shadow:"Cień tekstu",uv_index_entity:"Czujnik indeksu UV",visual_style:"Grafika",visual_style_classic:"Klasyczna",visual_style_modern:"Nowoczesna",wind_bearing_entity:"Czujnik kierunku wiatru",wind_gust_entity:"Czujnik porywów wiatru",wind_speed_entity:"Czujnik prędkości wiatru",language_da:"Duński",language_nb:"Norweski (bokmål)",language_pt:"Portugalski",language_sl:"Słoweński",language_sr:"Serbski",language_tr:"Turecki",language_zh:"Chiński",hourly_forecast_hours_helper:"Bez limitu: np. 72 na trzy dni lub więcej, aby pokazać całą prognozę dostawcy"}};var bi={sunny:"Ensolarado",clear:"Limpo",overcast:"Encoberto",cloudy:"Nublado",partlycloudy:"Parcialmente nublado",rainy:"Chuvoso",rain:"Chuva",snowy:"Neve",snow:"Neve",foggy:"Nevoeiro",fog:"Nevoeiro",lightning:"Relâmpagos","lightning-rainy":"Trovoada",pouring:"Chuva forte","snowy-rainy":"Chuva com neve",hail:"Granizo","clear-night":"Noite limpa",windy:"Ventoso","windy-variant":"Ventoso, nublado",feels_like:"Sensação",forecast_title:"Previsão de hoje",forecast_title_hourly:"Previsão horária",daily_forecast_title:"Previsão diária",no_data:"Sem dados",forecast_unavailable:"Previsão indisponível",weather:"Clima",language:"Idioma",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"nós",wind_unit_fts:"ft/s",show_clock:"Mostrar hora atual",am:"AM",pm:"PM",pressure:"Pressão",uv_index:"Índice UV",dew_point:"Ponto de orvalho",aqi:"Índice de qualidade do ar",precipitation_outlook:{start:"{kind}: começa por volta de {time}",soon:"{kind}: começa em breve",stop:"{kind}: termina por volta de {time}",continues:"{kind}: pelo menos mais {hours} h",rain:"Chuva",snow:"Neve",sleet:"Chuva com neve",hail:"Granizo",storm:"Trovoadas"},editor:{entity:"Entidade de clima",name:"Título do card",layout:"Layout",layout_default:"Padrão",layout_minimal:"Mínimo",height:"Altura",show_feels_like:"Sensação térmica",show_wind:"Vento",show_wind_gust:"Rajadas",show_wind_direction:"Direção",show_humidity:"Humidade",show_min_temp:"Temperatura mínima",show_hourly_forecast:"Previsão horária",hourly_forecast_hours:"Horas",hourly_forecast_step:"A cada",hourly_forecast_chart:"Gráfico de temperatura",hourly_forecast_title:"Título da previsão horária",show_daily_forecast:"Previsão diária",daily_forecast_days:"Dias",daily_forecast_title:"Título da previsão diária",show_sunrise_sunset:"Nascer e pôr do sol",sunrise_entity:"Sensor de nascer do sol",sunset_entity:"Sensor de pôr do sol",sensors:"Sensores (opcional, substituem a entidade meteorológica)",temperature_entity:"Sensor de temperatura",feels_like_entity:"Sensor de sensação térmica",humidity_entity:"Sensor de humidade",wind_speed_entity:"Sensor de velocidade do vento",wind_gust_entity:"Sensor de rajadas de vento",wind_bearing_entity:"Sensor de direção do vento",precipitation_entity:"Sensor de precipitação",show_clock:"Relógio",show_date:"Data",clock_position:"Posição",clock_position_top:"Topo",clock_position_details:"Detalhes",clock_format:"Formato",clock_format_12h:"12 horas (AM/PM)",clock_format_24h:"24 horas",overlay_opacity:"Escurecimento",text_shadow:"Sombra do texto",text_color:"Cor do texto",border_radius:"Raio dos cantos",sun_position_x:"Posição do sol/lua, horizontal",sun_position_y:"Posição do sol/lua, vertical",language:"Idioma",language_auto:"Automático",language_en:"Inglês",language_ru:"Russo",language_de:"Alemão",language_nl:"Holandês",language_fr:"Francês",language_es:"Espanhol",language_it:"Italiano",language_sk:"Eslovaco",language_hu:"Húngaro",language_pt:"Português",language_da:"Dinamarquês",language_sr:"Sérvio",language_pl:"Polaco",language_zh:"Chinês",language_tr:"Turco",language_nb:"Norueguês (Bokmål)",wind_speed_unit:"Unidade de velocidade do vento",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (como a integração)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"nós",wind_speed_unit_helper:"Auto mantém a unidade da integração ou do sensor de vento; as outras convertem todo o vento do cartão",show_animations:"Animações",animation_quality:"Qualidade da animação",animation_quality_helper:"Reduza em tablets de parede e dispositivos lentos",animation_quality_high:"Alta",animation_quality_low:"Baixa (20 FPS, para dispositivos lentos)",animation_quality_medium:"Média (30 FPS, menos partículas)",aqi_entity:"Sensor de qualidade do ar (AQI)",daily_forecast_title_helper:"Vazio = título padrão",dew_point_entity:"Sensor de ponto de orvalho",hourly_forecast_title_helper:"Vazio = título padrão",overlay_opacity_helper:"0–1, escurece o céu para manter o texto legível",pressure_entity:"Sensor de pressão",section_appearance:"Aparência",section_clock:"Idioma, relógio e data",section_details:"Detalhes",section_forecast:"Previsão",section_sensors:"Sensores (opcional)",show_aurora:"Aurora boreal",show_aurora_helper:"Em noites limpas, gráficos modernos",show_dew_point:"Ponto de orvalho",show_precipitation_outlook:"Quando a chuva começa/termina",show_precipitation_outlook_helper:"Pela previsão horária das próximas 12 horas",show_pressure:"Pressão",show_raindrops:"Gotas de chuva no vidro",show_raindrops_helper:"Com chuva, gráficos modernos",show_temperature_bars:"Barras de temperatura",show_forecast_wind:"Vento nas previsões",show_forecast_wind_helper:"Direção, velocidade e rajadas para cada hora e cada dia, se o fornecedor meteorológico as indicar",hourly_forecast_step_helper:"Mostrar a previsão a cada poucas horas, p. ex. 3 para 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Uma curva de temperatura em vez de números, com a probabilidade de precipitação em barras",show_forecast_description:"Previsão em texto",show_forecast_description_helper:"A previsão escrita do fornecedor meteorológico, se a tiver (p. ex. o National Weather Service dos EUA)",show_uv_index:"Índice UV",show_wind_effects:"Rajadas e folhas",show_wind_effects_helper:"Com vento ou acima de 8 m/s",sun_position_x_helper:"Deixe vazio para seguir a hora do dia",sun_position_y_helper:"Deixe vazio para seguir a hora do dia",text_color_helper:"Qualquer cor CSS, p. ex. #1a1a2e ou var(--primary-text-color)",uv_index_entity:"Sensor de índice UV",visual_style:"Gráficos",visual_style_classic:"Clássico",visual_style_modern:"Moderno",language_sl:"Esloveno",hourly_forecast_hours_helper:"Sem limite: p. ex. 72 para três dias, ou mais para mostrar toda a previsão do fornecedor"}};var xi={sunny:"Солнечно",clear:"Ясно",overcast:"Пасмурно",cloudy:"Облачно",partlycloudy:"Переменная облачность",rainy:"Дождь",rain:"Дождь",snowy:"Снег",snow:"Снег",foggy:"Туман",fog:"Туман",lightning:"Гроза","lightning-rainy":"Гроза с дождем",pouring:"Сильный дождь","snowy-rainy":"Мокрый снег",hail:"Град","clear-night":"Ясная ночь",windy:"Ветрено","windy-variant":"Ветрено, облачно",feels_like:"Ощущается как",forecast_title:"Прогноз на сегодня",forecast_title_hourly:"Почасовой прогноз",daily_forecast_title:"Ежедневный прогноз",no_data:"Нет данных",forecast_unavailable:"Прогноз недоступен",weather:"Погода",language:"Язык",wind_unit_kmh:"км/ч",wind_unit_ms:"м/с",wind_unit_mph:"миль/ч",wind_unit_knots:"узлы",wind_unit_fts:"фут/с",show_clock:"Показывать часы",am:"ДП",pm:"ПП",pressure:"Давление",uv_index:"УФ-индекс",dew_point:"Точка росы",aqi:"Индекс качества воздуха",precipitation_outlook:{start:"{kind} ожидается около {time}",soon:"{kind} ожидается в ближайший час",stop:"{kind} закончится около {time}",continues:"{kind} продлится ещё не меньше {hours} ч",rain:"Дождь",snow:"Снег",sleet:"Мокрый снег",hail:"Град",storm:"Гроза"},editor:{entity:"Погодная сущность",name:"Название карточки",layout:"Макет",layout_default:"Обычный",layout_minimal:"Минимальный",visual_style:"Графика",visual_style_modern:"Современный",visual_style_classic:"Классический",animation_quality:"Качество анимации",animation_quality_high:"Высокое",animation_quality_medium:"Среднее (30 FPS, меньше частиц)",animation_quality_low:"Низкое (20 FPS, для слабых устройств)",height:"Высота",show_feels_like:"Ощущается как",show_wind:"Ветер",show_wind_gust:"Порывы",show_wind_direction:"Направление",show_humidity:"Влажность",show_min_temp:"Мин. температура",show_hourly_forecast:"Прогноз по часам",hourly_forecast_hours:"Часов",hourly_forecast_step:"Шаг",hourly_forecast_chart:"График температуры",hourly_forecast_title:"Заголовок",show_daily_forecast:"Прогноз по дням",daily_forecast_days:"Дней",daily_forecast_title:"Заголовок",show_sunrise_sunset:"Восход и закат",sunrise_entity:"Датчик восхода",sunset_entity:"Датчик заката",sensors:"Датчики (необязательно, заменяют данные погоды)",temperature_entity:"Датчик температуры",feels_like_entity:"Датчик «ощущается как»",humidity_entity:"Датчик влажности",wind_speed_entity:"Датчик скорости ветра",wind_gust_entity:"Датчик порывов ветра",wind_bearing_entity:"Датчик направления ветра",precipitation_entity:"Датчик осадков",show_pressure:"Давление",show_uv_index:"УФ-индекс",show_dew_point:"Точка росы",show_precipitation_outlook:"Когда начнётся дождь",show_temperature_bars:"Полоски температур",show_forecast_wind:"Ветер в прогнозах",show_forecast_wind_helper:"Направление, скорость и порывы для каждого часа и дня, если их передаёт поставщик погоды",hourly_forecast_step_helper:"Показывать прогноз раз в несколько часов, например 3 — 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Кривая температуры вместо чисел и столбики вероятности осадков",show_forecast_description:"Текстовый прогноз",show_forecast_description_helper:"Словесный прогноз от поставщика погоды, если он есть (например, у метеослужбы США NWS)",pressure_entity:"Датчик давления",uv_index_entity:"Датчик УФ-индекса",dew_point_entity:"Датчик точки росы",aqi_entity:"Датчик качества воздуха (AQI)",show_clock:"Часы",show_date:"Дата",clock_position:"Положение",clock_position_top:"Вверху",clock_position_details:"Детали",clock_format:"Формат",clock_format_12h:"12-часовой (AM/PM)",clock_format_24h:"24-часовой",overlay_opacity:"Затемнение",text_shadow:"Тень текста",text_color:"Цвет текста",border_radius:"Скругление углов",sun_position_x:"Солнце/луна по горизонтали",sun_position_y:"Солнце/луна по вертикали",language:"Язык",language_auto:"Авто",language_en:"Английский",language_ru:"Русский",language_de:"Немецкий",language_nl:"Нидерландский",language_fr:"Французский",language_es:"Испанский",language_it:"Итальянский",language_sk:"Словацкий",language_hu:"Венгерский",language_pt:"Португальский",language_da:"Датский",language_sr:"Сербский",language_pl:"Польский",language_zh:"Китайский",language_tr:"Турецкий",language_nb:"Норвежский (букмол)",language_sl:"Словенский",wind_speed_unit:"Единица скорости ветра",wind_speed_unit_ms:"м/с",wind_speed_unit_kmh:"км/ч",wind_speed_unit_auto:"Авто (как в интеграции)",wind_speed_unit_mph:"миль/ч",wind_speed_unit_kn:"узлы",wind_speed_unit_helper:"Авто — единицы интеграции или датчика ветра; остальные варианты переводят весь ветер на карточке",show_animations:"Анимации",show_aurora:"Северное сияние",section_appearance:"Внешний вид",section_details:"Детали",section_forecast:"Прогноз",section_clock:"Язык, часы и дата",section_sensors:"Датчики (необязательно)",animation_quality_helper:"Понизьте для настенных планшетов и слабых устройств",show_aurora_helper:"Ясной ночью, в современной графике",overlay_opacity_helper:"0–1, затемняет небо, чтобы текст читался",text_color_helper:"Любой цвет CSS, например #1a1a2e или var(--primary-text-color)",sun_position_x_helper:"Пусто — по времени суток",sun_position_y_helper:"Пусто — по времени суток",show_precipitation_outlook_helper:"По почасовому прогнозу на 12 часов вперёд",hourly_forecast_title_helper:"Пусто — стандартный заголовок",daily_forecast_title_helper:"Пусто — стандартный заголовок",show_raindrops:"Капли на стекле",show_wind_effects:"Порывы ветра и листья",show_raindrops_helper:"В дождь, в современной графике",show_wind_effects_helper:"В ветреную погоду или при ветре от 8 м/с",hourly_forecast_hours_helper:"Без ограничений: например, 72 — три дня, или больше, чтобы показать весь прогноз провайдера"}};var Si={sunny:"Slnečno",clear:"Jasno",overcast:"Zamračené",cloudy:"Oblačno",partlycloudy:"Polooblačno",rainy:"Daždivo",rain:"Dážď",snowy:"Sneženie",snow:"Sneh",foggy:"Hmlisto",fog:"Hmla",lightning:"Blesky","lightning-rainy":"Búrka",pouring:"Silný dážď","snowy-rainy":"Dážď so snehom",hail:"Krúpy","clear-night":"Jasná noc",windy:"Veterno","windy-variant":"Veterno, oblačno",feels_like:"Pocitová teplota",forecast_title:"Predpoveď na dnes",forecast_title_hourly:"Hodinová predpoveď",daily_forecast_title:"Denná predpoveď",no_data:"Žiadne dáta",forecast_unavailable:"Predpoveď nedostupná",weather:"Počasie",language:"Jazyk",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"uzly",wind_unit_fts:"ft/s",show_clock:"Zobraziť aktuálny čas",am:"dop.",pm:"pop.",pressure:"Tlak",uv_index:"UV index",dew_point:"Rosný bod",aqi:"Index kvality ovzdušia",precipitation_outlook:{start:"{kind} sa očakáva okolo {time}",soon:"{kind} sa očakáva čoskoro",stop:"{kind} skončí okolo {time}",continues:"{kind} ešte aspoň {hours} h",rain:"Dážď",snow:"Sneh",sleet:"Dážď so snehom",hail:"Krupobitie",storm:"Búrka"},editor:{entity:"Entita počasia",name:"Názov karty",layout:"Rozloženie",layout_default:"Default",layout_minimal:"Minimal",height:"Výška",show_feels_like:"Pocitová teplota",show_wind:"Vietor",show_wind_gust:"Nárazy",show_wind_direction:"Smer",show_humidity:"Vlhkosť",show_min_temp:"Minimálna teplota",show_hourly_forecast:"Hodinová predpoveď",hourly_forecast_hours:"Hodiny",hourly_forecast_step:"Každých",hourly_forecast_chart:"Graf teploty",show_daily_forecast:"Denná predpoveď",daily_forecast_days:"Dni",show_sunrise_sunset:"Východ a západ slnka",sunrise_entity:"Senzor východu slnka",sunset_entity:"Senzor západu slnka",show_clock:"Hodiny",clock_position:"Poloha",clock_position_top:"Hore",clock_position_details:"V detailoch",clock_format:"Formát",clock_format_12h:"12-hodinový (AM/PM)",clock_format_24h:"24-hodinový",overlay_opacity:"Stmavenie",text_shadow:"Tieň textu",language:"Jazyk",language_auto:"Automaticky",language_en:"Angličtina",language_ru:"Ruština",language_de:"Nemčina",language_nl:"Holandčina",language_fr:"Francúzština",language_es:"Španielčina",language_it:"Taliančina",language_sk:"Slovenčina",language_hu:"Maďarčina",language_pt:"Portugalčina",wind_speed_unit:"Jednotka rýchlosti vetra",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (ako integrácia)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"uzly",wind_speed_unit_helper:"Auto ponechá jednotku integrácie alebo senzora vetra; ostatné prepočítajú všetok vietor na karte",show_animations:"Animácie",animation_quality:"Kvalita animácie",animation_quality_helper:"Znížte na nástenných tabletoch a pomalých zariadeniach",animation_quality_high:"Vysoká",animation_quality_low:"Nízka (20 FPS, pre pomalé zariadenia)",animation_quality_medium:"Stredná (30 FPS, menej častíc)",aqi_entity:"Senzor kvality ovzdušia (AQI)",border_radius:"Zaoblenie rohov",daily_forecast_title:"Nadpis",daily_forecast_title_helper:"Prázdne = predvolený nadpis",dew_point_entity:"Senzor rosného bodu",feels_like_entity:"Senzor pocitovej teploty",hourly_forecast_title:"Nadpis",hourly_forecast_title_helper:"Prázdne = predvolený nadpis",humidity_entity:"Senzor vlhkosti",overlay_opacity_helper:"0–1, stmaví oblohu, aby bol text čitateľný",precipitation_entity:"Senzor zrážok",pressure_entity:"Senzor tlaku",section_appearance:"Vzhľad",section_clock:"Jazyk, hodiny a dátum",section_details:"Podrobnosti",section_forecast:"Predpoveď",section_sensors:"Senzory (voliteľné)",sensors:"Senzory (voliteľné, nahrádzajú entitu počasia)",show_aurora:"Polárna žiara",show_aurora_helper:"Za jasných nocí, moderná grafika",show_date:"Dátum",show_dew_point:"Rosný bod",show_precipitation_outlook:"Kedy začne/prestane pršať",show_precipitation_outlook_helper:"Z hodinovej predpovede na nasledujúcich 12 hodín",show_pressure:"Tlak",show_raindrops:"Kvapky dažďa na skle",show_raindrops_helper:"Pri daždi, moderná grafika",show_temperature_bars:"Teplotné pruhy",show_forecast_wind:"Vietor v predpovediach",show_forecast_wind_helper:"Smer, rýchlosť a nárazy vetra pre každú hodinu a deň, ak ich poskytovateľ počasia uvádza",hourly_forecast_step_helper:"Zobraziť predpoveď každých pár hodín, napr. 3 pre 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Krivka teploty namiesto čísel a pravdepodobnosť zrážok ako stĺpce",show_forecast_description:"Textová predpoveď",show_forecast_description_helper:"Písaná predpoveď poskytovateľa počasia, ak ju má (napr. americká National Weather Service)",show_uv_index:"UV index",show_wind_effects:"Nárazy vetra a lístie",show_wind_effects_helper:"Pri veternom počasí alebo nad 8 m/s",sun_position_x:"Poloha slnka/mesiaca, vodorovne",sun_position_x_helper:"Nechajte prázdne, aby sa riadila dennou dobou",sun_position_y:"Poloha slnka/mesiaca, zvisle",sun_position_y_helper:"Nechajte prázdne, aby sa riadila dennou dobou",temperature_entity:"Senzor teploty",text_color:"Farba textu",text_color_helper:"Ľubovoľná farba CSS, napr. #1a1a2e alebo var(--primary-text-color)",uv_index_entity:"Senzor UV indexu",visual_style:"Grafika",visual_style_classic:"Klasická",visual_style_modern:"Moderná",wind_bearing_entity:"Senzor smeru vetra",wind_gust_entity:"Senzor nárazov vetra",wind_speed_entity:"Senzor rýchlosti vetra",language_da:"Dánčina",language_nb:"Nórčina (bokmål)",language_pl:"Poľština",language_sl:"Slovinčina",language_sr:"Srbčina",language_tr:"Turečtina",language_zh:"Čínština",hourly_forecast_hours_helper:"Bez obmedzenia: napr. 72 na tri dni alebo viac, aby sa zobrazila celá predpoveď poskytovateľa"}};var Mi={sunny:"Sončno",clear:"Jasno",overcast:"Zastrto",cloudy:"Oblačno",partlycloudy:"Delno oblačno",rainy:"Deževno",rain:"Dež",snowy:"Sneženo",snow:"Sneg",foggy:"Megleno",fog:"Megla",lightning:"Strela","lightning-rainy":"Nevihta",pouring:"Močen dež","snowy-rainy":"Dež s snegom",hail:"Toča","clear-night":"Jasna noč",windy:"Vetrovno","windy-variant":"Vetrovno, oblačno",feels_like:"Občutno kot",forecast_title:"Današnja napoved",forecast_title_hourly:"Urna napoved",daily_forecast_title:"Dnevna napoved",no_data:"Ni podatkov",forecast_unavailable:"Napoved nedostopna",weather:"Vreme",language:"Jezik",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"vozlov",wind_unit_fts:"ft/s",show_clock:"Pokaži trenutni čas",am:"AM",pm:"PM",pressure:"Pritisk",uv_index:"UV indeks",dew_point:"Rosišče",aqi:"Indeks kakovosti zraka",precipitation_outlook:{start:"{kind} napovedano okoli {time}",soon:"{kind} napovedano kmalu",stop:"{kind} se konča okoli {time}",continues:"{kind} najmanj za {hours} ur",rain:"Dež",snow:"Sneg",sleet:"Dež s snegom",hail:"Toča",storm:"Nevihta"},editor:{entity:"Vremenska entiteta",name:"Naslov karte",layout:"Postavitev",layout_default:"Privzeto",layout_minimal:"Minimalistično",visual_style:"Grafično",visual_style_modern:"Moderno",visual_style_classic:"Klasično",animation_quality:"Kvaliteta animacije",animation_quality_high:"Visoko",animation_quality_medium:"Srednje (30 FPS, manj delcev)",animation_quality_low:"Nizko (20 FPS, za počasne naprave)",height:"Višina",show_feels_like:"Občutno kot",show_wind:"Veter",show_wind_gust:"Sunki",show_wind_direction:"Smer",show_humidity:"Vlažnost",show_min_temp:"Min temperatura",show_hourly_forecast:"Urna napoved",hourly_forecast_hours:"Ure",hourly_forecast_step:"Vsakih",hourly_forecast_chart:"Graf temperature",hourly_forecast_title:"Naslov",show_daily_forecast:"Dnevna napoved",daily_forecast_days:"Dni",daily_forecast_title:"Naslov",show_sunrise_sunset:"Vzhod in zahod",sunrise_entity:"Senzor sončnega vzhoda",sunset_entity:"Senzor sončnega zahoda",sensors:"Senzorji (neobvezno, preglasijo vremensko entiteto)",temperature_entity:"Temperaturni senzor",feels_like_entity:"Senzor občutene temperature",humidity_entity:"Senzor vlažnosti",wind_speed_entity:"Senzor hitrosti vetra",wind_gust_entity:"Senzor sunkov vetra",wind_bearing_entity:"Senzor smeri vetra",precipitation_entity:"Senzor padavin",show_pressure:"Pritisk",show_uv_index:"UV indeks",show_dew_point:"Rosišče",show_precipitation_outlook:"Kdaj se dež začne/konča",show_temperature_bars:"Temperaturni stolpci",show_forecast_wind:"Veter v napovedih",show_forecast_wind_helper:"Smer, hitrost in sunki vetra za vsako uro in dan, če jih ponudnik vremena posreduje",hourly_forecast_step_helper:"Prikaži napoved na nekaj ur, npr. 3 za 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Krivulja temperature namesto številk, z verjetnostjo padavin kot stolpci",show_forecast_description:"Besedilna napoved",show_forecast_description_helper:"Pisna napoved ponudnika vremena, če jo ima (npr. ameriška National Weather Service)",pressure_entity:"Senzor pritiska",uv_index_entity:"Senzor UV indeksa",dew_point_entity:"Senzor rosišča",aqi_entity:"Senzor kakovosti zraka (AQI)",show_clock:"Ura",show_date:"Datum",clock_position:"Položaj",clock_position_top:"Zgoraj",clock_position_details:"Podrobnosti",clock_format:"Oblika",clock_format_12h:"12-urna (AM/PM)",clock_format_24h:"24-urna",overlay_opacity:"Zatemnitev",text_shadow:"Senca besedila",text_color:"Barva besedila",border_radius:"Zaobljenost vogalov",sun_position_x:"Položaj sonca/lune, vodoravno",sun_position_y:"Položaj sonca/lune, navpično",language:"Jezik",language_auto:"Samodejno",language_en:"Angleščina",language_ru:"Ruščina",language_de:"Nemščina",language_nl:"Nizozemščina",language_fr:"Francoščina",language_es:"Španščina",language_it:"Italijanščina",language_sk:"Slovaščina",language_hu:"Madžarščina",language_pt:"Portugalščina",language_da:"Danščina",language_sr:"Srbščina",language_pl:"Poljščina",language_zh:"Kitajščina",language_tr:"Turščina",language_nb:"Norveščina (bokmål)",language_sl:"Slovenščina",wind_speed_unit:"Enota hitrosti vetra",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Samodejno (kot integracija)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"vozlov",wind_speed_unit_helper:"Samodejno ohrani enoto integracije ali senzorja vetra; ostale pretvorijo ves veter na kartici",show_animations:"Animacije",show_aurora:"Severni sij",section_appearance:"Videz",section_details:"Podrobnosti",section_forecast:"Napoved",section_clock:"Jezik, ura in datum",section_sensors:"Senzorji (neobvezno)",animation_quality_helper:"Znižajte za stenske tablice in počasne naprave",show_aurora_helper:"Ob jasnih nočeh, moderna grafika",overlay_opacity_helper:"0–1, zatemni nebo, da je besedilo berljivo",text_color_helper:"Katera koli CSS barva, npr. #1a1a2e ali var(--primary-text-color)",sun_position_x_helper:"Pustite prazno za samodejni položaj glede na čas dneva",sun_position_y_helper:"Pustite prazno za samodejni položaj glede na čas dneva",show_precipitation_outlook_helper:"Iz urne napovedi za naslednjih 12 ur",hourly_forecast_title_helper:"Prazno = privzeti naslov",daily_forecast_title_helper:"Prazno = privzeti naslov",show_raindrops:"Dežne kaplje na steklu",show_wind_effects:"Sunki vetra in listje",show_raindrops_helper:"Ob dežju, moderna grafika",show_wind_effects_helper:"Ob vetrovnem vremenu ali nad 8 m/s",hourly_forecast_hours_helper:"Brez omejitve: npr. 72 za tri dni ali več za prikaz celotne napovedi ponudnika"}};var Ci={sunny:"Sunčano",clear:"Vedro",overcast:"Oblačno",cloudy:"Oblačno",partlycloudy:"Delimično oblačno",rainy:"Kišovito",rain:"Kiša",snowy:"Snežno",snow:"Sneg",foggy:"Maglovito",fog:"Magla",lightning:"Grmljavina","lightning-rainy":"Grmljavina sa kišom",pouring:"Pljusak","snowy-rainy":"Susnežica",hail:"Grad","clear-night":"Vedra noć",windy:"Vetrovito","windy-variant":"Vetrovito, oblačno",feels_like:"Subjektivni osećaj",forecast_title:"Prognoza",forecast_title_hourly:"Satna prognoza",daily_forecast_title:"Dnevna prognoza",no_data:"Nema podataka",forecast_unavailable:"Prognoza nije dostupna",weather:"Vreme",language:"Jezik",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"čvorova",wind_unit_fts:"ft/s",show_clock:"Prikaži sat",am:"AM",pm:"PM",pressure:"Pritisak",uv_index:"UV indeks",dew_point:"Tačka rose",aqi:"Indeks kvaliteta vazduha",precipitation_outlook:{start:"{kind} se očekuje oko {time}",soon:"{kind} se očekuje uskoro",stop:"{kind} prestaje oko {time}",continues:"{kind} još najmanje {hours} h",rain:"Kiša",snow:"Sneg",sleet:"Susnežica",hail:"Grad",storm:"Grmljavina"},editor:{entity:"Entitet",name:"Naziv (opciono)",layout:"Raspored",layout_default:"Podrazumevano",layout_minimal:"Minimalno",height:"Visina",show_feels_like:"Osećaj temperature",show_wind:"Vetar",show_wind_gust:"Udari",show_wind_direction:"Pravac",show_humidity:"Vlažnost",show_min_temp:"Minimalna temperatura",show_hourly_forecast:"Satna prognoza",hourly_forecast_hours:"Sati",hourly_forecast_step:"Svakih",hourly_forecast_chart:"Grafikon temperature",show_daily_forecast:"Dnevna prognoza",daily_forecast_days:"Dani",show_sunrise_sunset:"Izlazak i zalazak sunca",sunrise_entity:"Senzor izlaska sunca",sunset_entity:"Senzor zalaska sunca",show_clock:"Sat",clock_position:"Položaj",clock_position_top:"Vrh",clock_position_details:"Detalji",clock_format:"Format",clock_format_12h:"12h",clock_format_24h:"24h",overlay_opacity:"Zatamnjenje",language:"Jezik",language_auto:"Automatski",language_en:"Engleski",language_ru:"Ruski",language_de:"Nemački",language_nl:"Holandski",language_fr:"Francuski",language_es:"Španski",language_it:"Italijanski",language_sk:"Slovački",language_hu:"Mađarski",wind_speed_unit:"Jedinica brzine vetra",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"Auto (kao integracija)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"čvorova",wind_speed_unit_helper:"Auto zadržava jedinicu integracije ili senzora vetra; ostale preračunavaju sav vetar na kartici",animation_quality:"Kvalitet animacije",animation_quality_helper:"Smanjite na zidnim tabletima i sporim uređajima",animation_quality_high:"Visok",animation_quality_low:"Nizak (20 FPS, za spore uređaje)",animation_quality_medium:"Srednji (30 FPS, manje čestica)",aqi_entity:"Senzor kvaliteta vazduha (AQI)",border_radius:"Zaobljenost uglova",daily_forecast_title:"Naslov",daily_forecast_title_helper:"Prazno = podrazumevani naslov",dew_point_entity:"Senzor tačke rose",feels_like_entity:"Senzor osećaja temperature",hourly_forecast_title:"Naslov",hourly_forecast_title_helper:"Prazno = podrazumevani naslov",humidity_entity:"Senzor vlažnosti",overlay_opacity_helper:"0–1, zatamnjuje nebo da bi tekst bio čitljiv",precipitation_entity:"Senzor padavina",pressure_entity:"Senzor pritiska",section_appearance:"Izgled",section_clock:"Jezik, sat i datum",section_details:"Detalji",section_forecast:"Prognoza",section_sensors:"Senzori (opciono)",sensors:"Senzori (opciono, zamenjuju vremenski entitet)",show_animations:"Animacije",show_aurora:"Polarna svetlost",show_aurora_helper:"U vedrim noćima, moderna grafika",show_date:"Datum",show_dew_point:"Tačka rose",show_precipitation_outlook:"Kada kiša počinje/prestaje",show_precipitation_outlook_helper:"Iz satne prognoze za narednih 12 sati",show_pressure:"Pritisak",show_raindrops:"Kapi kiše na staklu",show_raindrops_helper:"Po kiši, moderna grafika",show_temperature_bars:"Trake temperature",show_forecast_wind:"Vetar u prognozama",show_forecast_wind_helper:"Smer, brzina i udari vetra za svaki sat i dan, ako ih pružalac vremenske prognoze daje",hourly_forecast_step_helper:"Prikaži prognozu na svakih nekoliko sati, npr. 3 za 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Kriva temperature umesto brojeva, sa verovatnoćom padavina kao stubićima",show_forecast_description:"Tekstualna prognoza",show_forecast_description_helper:"Pisana prognoza pružaoca vremenske prognoze, ako je ima (npr. američki National Weather Service)",show_uv_index:"UV indeks",show_wind_effects:"Udari vetra i lišće",show_wind_effects_helper:"Po vetrovitom vremenu ili iznad 8 m/s",sun_position_x:"Položaj sunca/meseca, vodoravno",sun_position_x_helper:"Ostavite prazno da prati doba dana",sun_position_y:"Položaj sunca/meseca, uspravno",sun_position_y_helper:"Ostavite prazno da prati doba dana",temperature_entity:"Senzor temperature",text_color:"Boja teksta",text_color_helper:"Bilo koja CSS boja, npr. #1a1a2e ili var(--primary-text-color)",text_shadow:"Senka teksta",uv_index_entity:"Senzor UV indeksa",visual_style:"Grafika",visual_style_classic:"Klasična",visual_style_modern:"Moderna",wind_bearing_entity:"Senzor pravca vetra",wind_gust_entity:"Senzor udara vetra",wind_speed_entity:"Senzor brzine vetra",language_da:"Danski",language_nb:"Norveški (bokmål)",language_pl:"Poljski",language_pt:"Portugalski",language_sl:"Slovenački",language_sr:"Srpski",language_tr:"Turski",language_zh:"Kineski",hourly_forecast_hours_helper:"Bez ograničenja: npr. 72 za tri dana, ili više da bi se prikazala cela prognoza dobavljača"}};var Ti={sunny:"Güneşli",clear:"Açık",overcast:"Kapalı",cloudy:"Bulutlu",partlycloudy:"Parçalı bulutlu",rainy:"Yağmurlu",rain:"Yağmur",snowy:"Karlı",snow:"Kar",foggy:"Sisli",fog:"Sis",lightning:"Şimşekli","lightning-rainy":"Fırtınalı",pouring:"Şiddetli yağmur","snowy-rainy":"Sulu kar",hail:"Dolu","clear-night":"Açık gece",windy:"Rüzgarlı","windy-variant":"Rüzgarlı, bulutlu",feels_like:"Hissedilen",forecast_title:"Saatlik tahmin",forecast_title_hourly:"Saatlik tahmin",daily_forecast_title:"Günlük hava tahmini",no_data:"Veri yok",forecast_unavailable:"Tahmin mevcut değil",weather:"Hava durumu",language:"Dil",wind_unit_kmh:"km/s",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"knot",wind_unit_fts:"ft/s",show_clock:"Saati göster",am:"ÖÖ",pm:"ÖS",pressure:"Basınç",uv_index:"UV indeksi",dew_point:"Çiy noktası",aqi:"Hava kalitesi indeksi",precipitation_outlook:{start:"{kind} {time} civarında bekleniyor",soon:"{kind} yakında bekleniyor",stop:"{kind} {time} civarında sona eriyor",continues:"{kind} en az {hours} saat daha sürecek",rain:"Yağmur",snow:"Kar",sleet:"Karla karışık yağmur",hail:"Dolu",storm:"Gök gürültülü fırtına"},editor:{entity:"Hava durumu varlığı",name:"Kart başlığı",layout:"Düzen",layout_default:"Varsayılan",layout_minimal:"Minimal",height:"Yükseklik",show_feels_like:"Hissedilen",show_wind:"Rüzgâr",show_wind_gust:"Hamleler",show_wind_direction:"Yön",show_humidity:"Nem",show_min_temp:"En düşük sıcaklık",show_hourly_forecast:"Saatlik tahmin",hourly_forecast_hours:"Saat",hourly_forecast_step:"Her",hourly_forecast_chart:"Sıcaklık grafiği",show_daily_forecast:"Günlük tahmin",daily_forecast_days:"Gün",show_sunrise_sunset:"Gün doğumu ve batımı",sunrise_entity:"Gün doğumu sensörü",sunset_entity:"Gün batımı sensörü",show_clock:"Saat",clock_position:"Konum",clock_position_top:"Üstte",clock_position_details:"Detaylar",clock_format:"Biçim",clock_format_12h:"12 saat (ÖÖ/ÖS)",clock_format_24h:"24 saat",overlay_opacity:"Karartma",text_shadow:"Metin gölgesi",language:"Dil",language_auto:"Otomatik",language_en:"İngilizce",language_ru:"Rusça",language_de:"Almanca",language_nl:"Flemenkçe",language_fr:"Fransızca",language_es:"İspanyolca",language_it:"İtalyanca",language_sk:"Slovakça",language_hu:"Macarca",language_pt:"Portekizce",language_da:"Danca",language_sr:"Sırpça",language_pl:"Lehçe",language_tr:"Türkçe",wind_speed_unit:"Rüzgâr hızı birimi",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/s",wind_speed_unit_auto:"Otomatik (entegrasyondaki gibi)",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"knot",wind_speed_unit_helper:"Otomatik, entegrasyonun veya rüzgar sensörünün birimini korur; diğerleri karttaki tüm rüzgarı dönüştürür",show_animations:"Animasyonlar",language_zh:"Çince",animation_quality:"Animasyon kalitesi",animation_quality_helper:"Duvar tabletlerinde ve yavaş cihazlarda düşürün",animation_quality_high:"Yüksek",animation_quality_low:"Düşük (20 FPS, yavaş cihazlar için)",animation_quality_medium:"Orta (30 FPS, daha az parçacık)",aqi_entity:"Hava kalitesi sensörü (AQI)",border_radius:"Köşe yuvarlaklığı",daily_forecast_title:"Başlık",daily_forecast_title_helper:"Boş = varsayılan başlık",dew_point_entity:"Çiy noktası sensörü",feels_like_entity:"Hissedilen sıcaklık sensörü",hourly_forecast_title:"Başlık",hourly_forecast_title_helper:"Boş = varsayılan başlık",humidity_entity:"Nem sensörü",overlay_opacity_helper:"0–1, metnin okunur kalması için gökyüzünü karartır",precipitation_entity:"Yağış sensörü",pressure_entity:"Basınç sensörü",section_appearance:"Görünüm",section_clock:"Dil, saat ve tarih",section_details:"Ayrıntılar",section_forecast:"Tahmin",section_sensors:"Sensörler (isteğe bağlı)",sensors:"Sensörler (isteğe bağlı, hava durumu varlığının yerine geçer)",show_aurora:"Kuzey ışıkları",show_aurora_helper:"Açık gecelerde, modern grafikler",show_date:"Tarih",show_dew_point:"Çiy noktası",show_precipitation_outlook:"Yağmurun başlama/bitme zamanı",show_precipitation_outlook_helper:"Önümüzdeki 12 saatlik saatlik tahminden",show_pressure:"Basınç",show_raindrops:"Camdaki yağmur damlaları",show_raindrops_helper:"Yağmurda, modern grafikler",show_temperature_bars:"Sıcaklık çubukları",show_forecast_wind:"Tahminlerde rüzgar",show_forecast_wind_helper:"Hava durumu sağlayıcısı veriyorsa her saat ve gün için yön, hız ve hamleler",hourly_forecast_step_helper:"Tahmini birkaç saatte bir göster, ör. 3 için 00:00, 03:00, 06:00 …",hourly_forecast_chart_helper:"Sayılar yerine sıcaklık eğrisi, yağış olasılığı çubuklarla",show_forecast_description:"Metin tahmini",show_forecast_description_helper:"Hava durumu sağlayıcısının yazılı tahmini, varsa (ör. ABD Ulusal Hava Durumu Servisi)",show_uv_index:"UV indeksi",show_wind_effects:"Rüzgâr hamleleri ve yapraklar",show_wind_effects_helper:"Rüzgârlı havada veya 8 m/s üzerinde",sun_position_x:"Güneş/ay konumu, yatay",sun_position_x_helper:"Günün saatini izlemesi için boş bırakın",sun_position_y:"Güneş/ay konumu, dikey",sun_position_y_helper:"Günün saatini izlemesi için boş bırakın",temperature_entity:"Sıcaklık sensörü",text_color:"Metin rengi",text_color_helper:"Herhangi bir CSS rengi, ör. #1a1a2e veya var(--primary-text-color)",uv_index_entity:"UV indeksi sensörü",visual_style:"Grafikler",visual_style_classic:"Klasik",visual_style_modern:"Modern",wind_bearing_entity:"Rüzgâr yönü sensörü",wind_gust_entity:"Rüzgâr hamlesi sensörü",wind_speed_entity:"Rüzgâr hızı sensörü",language_nb:"Norveççe (Bokmål)",language_sl:"Slovence",hourly_forecast_hours_helper:"Üst sınır yok: ör. üç gün için 72 veya sağlayıcının tüm tahmini için daha fazlası"}};var Ai={sunny:"晴朗",clear:"晴",overcast:"阴天",cloudy:"多云",partlycloudy:"局部多云",rainy:"有雨",rain:"雨",snowy:"有雪",snow:"雪",foggy:"有雾",fog:"雾",lightning:"雷电","lightning-rainy":"雷阵雨",pouring:"大雨","snowy-rainy":"雨夹雪",hail:"冰雹","clear-night":"晴夜",windy:"有风","windy-variant":"有风，多云",feels_like:"体感温度",forecast_title:"今日预报",forecast_title_hourly:"逐小时预报",daily_forecast_title:"每日预报",no_data:"无数据",forecast_unavailable:"预报不可用",weather:"天气",language:"语言",wind_unit_kmh:"km/h",wind_unit_ms:"m/s",wind_unit_mph:"mph",wind_unit_knots:"节",wind_unit_fts:"ft/s",show_clock:"显示当前时间",am:"上午",pm:"下午",pressure:"气压",uv_index:"紫外线指数",dew_point:"露点",aqi:"空气质量指数",precipitation_outlook:{start:"{kind}：约{time}开始",soon:"{kind}：即将开始",stop:"{kind}：约{time}结束",continues:"{kind}：至少再持续{hours}小时",rain:"雨",snow:"雪",sleet:"雨夹雪",hail:"冰雹",storm:"雷暴"},editor:{entity:"天气实体",name:"卡片标题",layout:"布局",layout_default:"默认",layout_minimal:"简约",height:"高度",show_feels_like:"体感温度",show_wind:"风",show_wind_gust:"阵风",show_wind_direction:"风向",show_humidity:"湿度",show_min_temp:"最低温度",show_hourly_forecast:"逐小时预报",hourly_forecast_hours:"小时数",hourly_forecast_step:"间隔",hourly_forecast_chart:"温度曲线",show_daily_forecast:"每日预报",daily_forecast_days:"天数",show_sunrise_sunset:"日出和日落",sunrise_entity:"日出传感器",sunset_entity:"日落传感器",show_clock:"时钟",clock_position:"位置",clock_position_top:"顶部",clock_position_details:"详情栏",clock_format:"格式",clock_format_12h:"12小时制 (AM/PM)",clock_format_24h:"24小时制",overlay_opacity:"暗化",text_shadow:"文字阴影",language:"语言",language_auto:"自动",language_en:"英语",language_ru:"俄语",language_de:"德语",language_nl:"荷兰语",language_fr:"法语",language_es:"西班牙语",language_it:"意大利语",language_sk:"斯洛伐克语",language_hu:"匈牙利语",language_pt:"葡萄牙语",language_da:"丹麦语",language_sr:"塞尔维亚语",language_pl:"波兰语",language_zh:"简体中文",wind_speed_unit:"风速单位",wind_speed_unit_ms:"m/s",wind_speed_unit_kmh:"km/h",wind_speed_unit_auto:"自动（与集成一致）",wind_speed_unit_mph:"mph",wind_speed_unit_kn:"节",wind_speed_unit_helper:"自动：使用集成或风速传感器的单位；其他选项会换算卡片上的所有风速",show_animations:"动画",animation_quality:"动画质量",animation_quality_helper:"在壁挂平板和性能较低的设备上可调低",animation_quality_high:"高",animation_quality_low:"低（20 FPS，适合低性能设备）",animation_quality_medium:"中（30 FPS，粒子更少）",aqi_entity:"空气质量传感器（AQI）",border_radius:"圆角半径",daily_forecast_title:"标题",daily_forecast_title_helper:"留空 = 默认标题",dew_point_entity:"露点传感器",feels_like_entity:"体感温度传感器",hourly_forecast_title:"标题",hourly_forecast_title_helper:"留空 = 默认标题",humidity_entity:"湿度传感器",overlay_opacity_helper:"0–1，调暗天空以保证文字清晰可读",precipitation_entity:"降水传感器",pressure_entity:"气压传感器",section_appearance:"外观",section_clock:"语言、时钟和日期",section_details:"详细信息",section_forecast:"预报",section_sensors:"传感器（可选）",sensors:"传感器（可选，覆盖天气实体）",show_aurora:"极光",show_aurora_helper:"晴朗的夜晚，现代图形",show_date:"日期",show_dew_point:"露点",show_precipitation_outlook:"何时开始/停止下雨",show_precipitation_outlook_helper:"根据未来 12 小时的逐小时预报",show_pressure:"气压",show_raindrops:"玻璃上的雨滴",show_raindrops_helper:"下雨时，现代图形",show_temperature_bars:"温度条",show_forecast_wind:"预报中的风",show_forecast_wind_helper:"天气服务提供时，显示每小时和每天的风向、风速和阵风",hourly_forecast_step_helper:"每隔几小时显示一次预报，例如 3 表示 00:00、03:00、06:00 …",hourly_forecast_chart_helper:"用温度曲线代替数字，并以柱状显示降水概率",show_forecast_description:"文字预报",show_forecast_description_helper:"天气服务提供的文字预报（如有，例如美国国家气象局）",show_uv_index:"紫外线指数",show_wind_effects:"阵风和落叶",show_wind_effects_helper:"刮风天或风速超过 8 m/s 时",sun_position_x:"太阳/月亮位置，水平",sun_position_x_helper:"留空则随一天中的时间变化",sun_position_y:"太阳/月亮位置，垂直",sun_position_y_helper:"留空则随一天中的时间变化",temperature_entity:"温度传感器",text_color:"文字颜色",text_color_helper:"任意 CSS 颜色，例如 #1a1a2e 或 var(--primary-text-color)",uv_index_entity:"紫外线指数传感器",visual_style:"图形",visual_style_classic:"经典",visual_style_modern:"现代",wind_bearing_entity:"风向传感器",wind_gust_entity:"阵风传感器",wind_speed_entity:"风速传感器",language_nb:"挪威语（书面挪威语）",language_sl:"斯洛文尼亚语",language_tr:"土耳其语",hourly_forecast_hours_helper:"无上限：例如 72 表示三天，填更大的数可显示服务商提供的全部预报"}};var j={da:hi,de:ci,en:pi,es:_i,et:mi,fr:gi,hu:fi,it:yi,nb:wi,nl:vi,pl:ki,pt:bi,ru:xi,sk:Si,sl:Mi,sr:Ci,tr:Ti,zh:Ai};class zi{constructor(){this.lang="en";this.fallback="en"}t(e){let t=e.split("."),i=t.reduce((n,o)=>n?.[o],j[this.lang]);if(i!=null)return i;return t.reduce((n,o)=>n?.[o],j[this.fallback])??e}addTranslations(e,t){let i=j[e];if(!i)return;j[e]={...i,...t}}setLanguage(e){if(!j[e]||this.lang===e)return;if(this.lang=e,typeof window<"u")window.dispatchEvent(new CustomEvent("language-changed"))}}var g=new zi;if(typeof window<"u")window.i18n=g;var ut=(e)=>{if(!e)return;let t=e.toLowerCase();if(Object.hasOwn(j,t))return t;let i=t.split("-")[0];if(Object.hasOwn(j,i))return i;return},ye=({configLang:e,hassLang:t}={})=>{if(e&&e!=="auto")return ut(e)??"en";return ut(t)??ut(typeof navigator<"u"?navigator.language:void 0)??"en"};function Qa(){let e=new Date,t=e.getHours(),i=e.getMinutes(),a=t*60+i;if(a>=I.SUNRISE_START&&a<I.SUNRISE_END)return{type:"sunrise",progress:(a-I.SUNRISE_START)/120};if(a>=I.SUNRISE_END&&a<I.DAY_END)return{type:"day",progress:(a-I.SUNRISE_END)/600};if(a>=I.DAY_END&&a<I.SUNSET_END)return{type:"sunset",progress:(a-I.DAY_END)/120};return{type:"night",progress:0}}function Ja(e,t,i){if(e.type==="sunrise"){let a=e.progress;return{x:t*(0.3+a*0.4),y:i*(0.85-a*0.55)}}else if(e.type==="sunset"){let a=e.progress;return{x:t*(0.5+a*0.3),y:i*(0.3+a*0.55)}}else if(e.type==="day"){let n=e.progress*Math.PI;return{x:t*(0.5+Math.sin(n)*0.25),y:i*(0.25-Math.sin(n)*0.1)}}else return{x:t*0.75,y:i*0.3}}function Ne(e,t,i,a){let n=Ja(e,t,i),o=(r)=>Math.min(100,Math.max(0,r))/100;if(typeof a?.x==="number")n.x=t*o(a.x);if(typeof a?.y==="number")n.y=i*o(a.y);return n}function Fi(e){if(e.type==="sunrise"){let t=e.progress,i={r:26,g:26,b:46},a={r:255,g:160,b:122},n={r:255,g:215,b:0};return{start:{r:Math.round(i.r+(a.r-i.r)*t),g:Math.round(i.g+(a.g-i.g)*t),b:Math.round(i.b+(a.b-i.b)*t)},end:{r:Math.round(i.r+(n.r-i.r)*t),g:Math.round(i.g+(n.g-i.g)*t),b:Math.round(i.b+(n.b-i.b)*t)}}}else if(e.type==="sunset"){let t=e.progress,i={r:255,g:107,b:107},a={r:255,g:160,b:122},n={r:26,g:26,b:46};return{start:{r:Math.round(i.r+(n.r-i.r)*t),g:Math.round(i.g+(n.g-i.g)*t),b:Math.round(i.b+(n.b-i.b)*t)},end:{r:Math.round(a.r+(n.r-a.r)*t),g:Math.round(a.g+(n.g-a.g)*t),b:Math.round(a.b+(n.b-a.b)*t)}}}return null}function Ei(e,t="24h",i="AM",a="PM"){if(!e)return"";let o=new Date(e).getHours();if(t==="12h"){let r=o%12||12,s=o<12?i:a;return`${r} ${s}`}return`${o.toString().padStart(2,"0")}:00`}function Ri(e,t=new Date){let i=t.toDateString();return e.map((a)=>{let n=new Date(a.datetime).toDateString(),o=n!==i;return i=n,o})}function dt(e,t){if(!e)return"";let i=new Date(e);if(Number.isNaN(i.getTime()))return"";return i.toLocaleDateString(t||void 0,{weekday:"short",day:"numeric",month:"short"})}function we(e,t="24h",i="AM",a="PM"){if(!e)return"";let n=typeof e==="string"?new Date(e):e,o=n.getHours(),r=n.getMinutes();if(t==="12h"){let s=o>=12?a:i;return o=o%12||12,`${o}:${r.toString().padStart(2,"0")} ${s}`}else return`${o.toString().padStart(2,"0")}:${r.toString().padStart(2,"0")}`}function ht(e,t=null,i=null,a=null){let n=null,o=null;if(t&&a&&a.states[t]){let r=a.states[t];n=new Date(r.state)}if(i&&a&&a.states[i]){let r=a.states[i];o=new Date(r.state)}if(!n||!o){if(e&&e.attributes){let r=e.attributes;if(!n&&(r.forecast_sunrise||r.sunrise))n=new Date(r.forecast_sunrise||r.sunrise);if(!o&&(r.forecast_sunset||r.sunset))o=new Date(r.forecast_sunset||r.sunset)}}if((!n||!o)&&a&&a.states["sun.sun"]){let s=a.states["sun.sun"].attributes;if(!n&&s.next_rising)n=new Date(s.next_rising);if(!o&&s.next_setting)o=new Date(s.next_setting)}return{sunrise:n,sunset:o,hasSunData:!!(n&&o)}}var ji=3600000,je=24*ji,D=ji;function Pi(e,t){return e+Math.floor((t-e)/je)*je}function ct(e,t=new Date){if(e.hasSunData&&e.sunrise&&e.sunset){let i=t.getTime(),a=Pi(e.sunrise.getTime(),i),n=Pi(e.sunset.getTime(),i);if(a>n){let s=n+je;if(i<a+D)return{type:"sunrise",progress:(i-(a-D))/(2*D)};if(i>=s-D)return{type:"sunset",progress:(i-(s-D))/(2*D)};let l=a+D,u=s-D;return{type:"day",progress:(i-l)/(u-l)}}let r=a+je;if(i<n+D)return{type:"sunset",progress:(i-(n-D))/(2*D)};if(i>=r-D)return{type:"sunrise",progress:(i-(r-D))/(2*D)};return{type:"night",progress:0}}return Qa()}var Di={ms:1,mps:1,kmh:0.2777777777777778,kmph:0.2777777777777778,mph:0.44704,kn:0.514444,kt:0.514444,kts:0.514444,knots:0.514444,fts:0.3048};function W(e,t,i){let a=(r)=>r.toLowerCase().replace(/[^a-z]/g,""),n=Di[a(t)],o=Di[a(i)];if(!n||!o||n===o)return e;return e*n/o}var Ie=["auto","ms","kmh","mph","kn"],$i={ms:"m/s",kmh:"km/h",mph:"mph",kn:"kn"},Ni=(e)=>e.toLowerCase().replace(/[^a-z]/g,"");function He(e,t="auto"){if(t!=="auto"&&$i[t])return $i[t];return e||"m/s"}function Ya(e,t){return["kmh","kmph","mph","kn","kt","kts","knots"].includes(Ni(t))?Math.round(e):Math.round(e*10)/10}function pt(e,t,i="auto"){if(e==null)return null;let a=t.wind_speed_unit||"m/s",n=He(a,i);return Ya(W(e,a,n),n)}function _t(e,t){let i=Ni(e);if(i==="kmh"||i==="kmph")return t("wind_unit_kmh");if(i==="ms"||i==="mps")return t("wind_unit_ms");if(i==="mph")return t("wind_unit_mph");if(["kn","kt","kts","knots"].includes(i))return t("wind_unit_knots");if(i==="fts"||i==="ftps")return t("wind_unit_fts");return e}function Ii(e,t,i){return _t(He(e.wind_speed_unit||"m/s",t),i)}function Hi(e,t){let i={weekday:"short",day:"numeric",month:"long"};try{return e.toLocaleDateString(t,i)}catch{return e.toLocaleDateString(void 0,i)}}function Li(e,t,i,a){if(t==="12h"){let n=e.getHours(),o=String(e.getMinutes()).padStart(2,"0"),r=n>=12?a:i;return n=n%12||12,`${n}:${o} ${r}`}else{let n=String(e.getHours()).padStart(2,"0"),o=String(e.getMinutes()).padStart(2,"0");return`${n}:${o}`}}function Le(e,t){let i=e?.querySelector(t);if(!i)return null;let a=(n)=>{let o=n;if(o.deltaY!==0)n.preventDefault(),i.scrollLeft+=o.deltaY};return i.addEventListener("wheel",a,{passive:!1}),()=>i.removeEventListener("wheel",a)}var Wi=H`
  :host {
    display: block;
    --card-width: 100%;
    --card-height: 200px;
    --primary-color: #007AFF;
    /* Classic style backgrounds */
    --day-gradient-start: #87CEEB;
    --day-gradient-end: #E0F6FF;
    --night-gradient-start: #1a1a2e;
    --night-gradient-end: #16213e;
    --sunset-gradient-start: #FF6B6B;
    --sunset-gradient-end: #FFA07A;
    --sunrise-gradient-start: #FFA07A;
    --sunrise-gradient-end: #FFD700;
    --overlay-opacity: 0.1;
  }

  ha-card {
    border-radius: var(--dwc-border-radius, var(--ha-card-border-radius, 12px));
    overflow: hidden;
    background: transparent;
    box-shadow: none;
    position: relative;
    z-index: 0;
    isolation: isolate;
  }

  .weather-card {
    position: relative;
    width: var(--card-width);
    min-height: var(--card-height, 200px);
    border-radius: var(--dwc-border-radius, 16px);
    overflow: visible;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    /* Sky colors come from the condition and time of day (see sky.ts) */
    background: linear-gradient(to bottom, var(--dwc-sky-top, #2E6FC7), var(--dwc-sky-bottom, #8CC2EC));
    transition: --dwc-sky-top 2s ease-in-out, --dwc-sky-bottom 2s ease-in-out, min-height 0.3s ease;
  }

  .weather-card.classic {
    background: linear-gradient(135deg, var(--day-gradient-start), var(--day-gradient-end));
    transition: background 2s ease-in-out, min-height 0.3s ease;
  }

  .weather-card.classic.night {
    background: linear-gradient(135deg, var(--night-gradient-start), var(--night-gradient-end));
  }

  .weather-card.classic.sunset {
    background: linear-gradient(135deg, var(--sunset-gradient-start), var(--sunset-gradient-end));
  }

  .weather-card.classic.sunrise {
    background: linear-gradient(135deg, var(--sunrise-gradient-start), var(--sunrise-gradient-end));
  }

  .canvas-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    min-height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Dark overlay for better text contrast */
  .weather-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, calc(var(--overlay-opacity) * 0.8)) 0%,
      rgba(0, 0, 0, calc(var(--overlay-opacity) * 1.2)) 100%
    );
    z-index: 1;
    border-radius: var(--dwc-border-radius, 16px);
  }

  .content {
    position: relative;
    z-index: 2;
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--dwc-text-color, white);
    text-shadow: var(--card-text-shadow);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .location {
    font-size: 18px;
    font-weight: 500;
    opacity: 0.9;
  }

  .temperature {
    font-size: 64px;
    font-weight: 100;
    line-height: 1;
    margin: 0;
  }

  .details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .details--clock {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .details--clock .info-grid {
    flex: 1;
  }

  .condition {
    font-size: 20px;
    font-weight: 400;
    opacity: 0.9;
  }

  .primary {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .primary-left {
    display: flex;
    flex-direction: column;
  }

  .feels-like {
    font-size: 16px;
    opacity: 0.85;
    margin-top: 8px;
  }

  /* The provider's text forecast; long ones are cut at three lines (full text on hover) */
  .forecast-description {
    margin-top: 16px;
    font-size: 14px;
    line-height: 1.4;
    opacity: 0.9;
    text-shadow: var(--card-text-shadow);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .precipitation-outlook {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 10px 0 12px;
    font-size: 14px;
    opacity: 0.95;
  }

  .temp-range {
    font-size: 18px;
    opacity: 0.9;
    margin-top: 8px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .temp-min {
    font-size: 14px;
    opacity: 0.7;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 12px;
    font-size: 13px;
    opacity: 0.9;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-item span:last-child {
    white-space: nowrap;
  }

  .info-icon {
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--dwc-text-color, white);
  }

  .info-icon svg {
    width: 20px;
    height: 20px;
    display: block;
  }

  .forecast-container {
    margin-top: 20px;
    padding-top: 20px;
    padding-bottom: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    width: 100%;
  }

  .forecast-title {
    font-size: 14px;
    font-weight: 500;
    opacity: 0.8;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .forecast-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 12px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }

  .forecast-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .forecast-scroll::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .forecast-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }

  .forecast-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  .forecast-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 60px;
  }

  .forecast-time {
    font-size: 12px;
    opacity: 0.7;
    font-weight: 400;
  }

  .forecast-icon {
    line-height: 1;
  }

  .forecast-icon svg {
    width: 32px;
    height: 32px;
    display: block;
  }

  .forecast-temp {
    font-size: 16px;
    font-weight: 500;
    opacity: 0.9;
  }

  .clock {
    margin-top: 0;
    margin-bottom: 0;
    font-size: 48px;
    font-weight: 200;
    line-height: 1;
    color: var(--dwc-text-color, white);
    text-align: right;
    text-shadow: var(--card-text-shadow);
    z-index: 2;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    .clock {
      font-size: 36px;
      margin-top: 0;
      margin-bottom: 0;
    }
  }

  /* ---- Minimal layout ---- */
  .weather-card.layout--minimal {
    min-height: 72px;
  }

  .weather-card.layout--minimal .content {
    flex-direction: row;
    align-items: center;
    padding: 8px 16px;
    gap: 16px;
    min-height: inherit;
  }

  .mini-primary {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-shrink: 0;
    gap: 0;
  }

  .mini-condition {
    font-size: 15px;
    opacity: 0.9;
    font-weight: 500;
    white-space: nowrap;
  }

  .mini-temp {
    font-size: 52px;
    font-weight: 200;
    line-height: 1;
  }

  .mini-temp-low {
    font-size: 14px;
    opacity: 0.75;
    margin-top: 2px;
  }

  .mini-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }

`;var f=(e)=>({r:parseInt(e.slice(1,3),16),g:parseInt(e.slice(3,5),16),b:parseInt(e.slice(5,7),16)}),Za={clear:{day:[f("#2E6FC7"),f("#8CC2EC")],night:[f("#060A1C"),f("#1A2546")],cloudLight:f("#FFFFFF"),cloudShade:f("#C6D4E2"),coverage:0.12,twilight:1},partly:{day:[f("#3A74BD"),f("#A0C4E2")],night:[f("#0A1027"),f("#26314E")],cloudLight:f("#FFFFFF"),cloudShade:f("#B9C7D5"),coverage:0.45,twilight:0.9},cloudy:{day:[f("#5E7387"),f("#A5B3C0")],night:[f("#151A23"),f("#2F3845")],cloudLight:f("#EEF1F4"),cloudShade:f("#98A4B1"),coverage:0.85,twilight:0.45},rain:{day:[f("#45576A"),f("#7E8FA0")],night:[f("#0F141C"),f("#252D38")],cloudLight:f("#CDD4DC"),cloudShade:f("#6D7986"),coverage:0.9,twilight:0.3},heavy:{day:[f("#35424F"),f("#62707E")],night:[f("#0B0F15"),f("#1D232C")],cloudLight:f("#AEB6C0"),cloudShade:f("#4A5460"),coverage:1,twilight:0.2},storm:{day:[f("#262B38"),f("#4C5465")],night:[f("#090B11"),f("#1A1E28")],cloudLight:f("#9098A4"),cloudShade:f("#353C48"),coverage:1,twilight:0.2},snow:{day:[f("#7990A6"),f("#C6D2DD")],night:[f("#1C2432"),f("#424D5E")],cloudLight:f("#F4F7FA"),cloudShade:f("#AAB6C3"),coverage:0.8,twilight:0.4},fog:{day:[f("#66727C"),f("#8C959D")],night:[f("#23272D"),f("#464B52")],cloudLight:f("#C3C9CF"),cloudShade:f("#949DA5"),coverage:0.5,twilight:0.35}},Ui={sunrise:[f("#5A7BBE"),f("#F8B77E")],sunset:[f("#3D4E8E"),f("#F08E5C")]},Xa=f("#4A5366"),en=f("#1A202C"),tn=f("#FFC9A6"),an=f("#6F5874");function nn(e){switch(e.toLowerCase()){case"sunny":case"clear":case"clear-night":case"windy":return"clear";case"partlycloudy":return"partly";case"rainy":case"rain":case"snowy-rainy":return"rain";case"pouring":case"hail":return"heavy";case"lightning":case"lightning-rainy":return"storm";case"snowy":case"snow":return"snow";case"foggy":case"fog":return"fog";default:return"cloudy"}}function B(e,t,i){return{r:Math.round(e.r+(t.r-e.r)*i),g:Math.round(e.g+(t.g-e.g)*i),b:Math.round(e.b+(t.b-e.b)*i)}}function F(e,t){return t===void 0?`rgb(${e.r}, ${e.g}, ${e.b})`:`rgba(${e.r}, ${e.g}, ${e.b}, ${t})`}var Oi=(e)=>e*e*(3-2*e);function q(e,t){let i=e.toLowerCase()==="clear-night"?"clear":nn(e),a=Za[i],n=Math.max(0,Math.min(1,t.progress)),o=t.type==="night"||e.toLowerCase()==="clear-night",r=1,s=0;if(o)r=0;else if(t.type==="sunrise")r=Oi(n),s=Math.sin(n*Math.PI)*a.twilight;else if(t.type==="sunset")r=Oi(1-n),s=Math.sin(n*Math.PI)*a.twilight;let l=t.type==="sunrise"?Ui.sunrise:Ui.sunset,u=B(B(a.night[0],a.day[0],r),l[0],s),d=B(B(a.night[1],a.day[1],r),l[1],s),h=B(B(Xa,a.cloudLight,r),tn,s*0.6),p=B(B(en,a.cloudShade,r),an,s*0.5);return{top:u,bottom:d,cloudLight:h,cloudShade:p,coverage:a.coverage,daylight:r}}function Bi(){if(typeof CSS>"u"||typeof CSS.registerProperty!=="function")return;Object.entries({"--dwc-sky-top":"#2E6FC7","--dwc-sky-bottom":"#8CC2EC"}).forEach(([t,i])=>{try{CSS.registerProperty({name:t,syntax:"<color>",inherits:!1,initialValue:i})}catch{}})}var We={high:{fps:60,particles:1,cloudLayers:3,details:!0,maxDpr:3},medium:{fps:30,particles:0.6,cloudLayers:2,details:!0,maxDpr:2},low:{fps:20,particles:0.35,cloudLayers:1,details:!1,maxDpr:1}};function Ue(e="high"){return{...We[e]}}class S{constructor(e){this.cloudField=null;this.quality=Ue();this.children=[];this.ctx=e}attach(e,t){this.cloudField=e,this.quality=t,this.children.forEach((i)=>i.attach(e,t))}drawCloud(e,t,i,a){let n=this.ctx.shadowBlur,o=this.ctx.shadowColor,r=this.ctx.globalAlpha;this.ctx.shadowBlur=i*0.25,this.ctx.shadowColor=`rgba(255, 255, 255, ${a*0.4})`,this.ctx.globalAlpha=a*0.85,this.ctx.fillStyle="rgba(255, 255, 255, 1)",[{x:e,y:t,r:i*0.4},{x:e+i*0.35,y:t,r:i*0.5},{x:e+i*0.65,y:t,r:i*0.48},{x:e+i*0.92,y:t,r:i*0.38},{x:e+i*0.18,y:t-i*0.28,r:i*0.38},{x:e+i*0.52,y:t-i*0.32,r:i*0.42},{x:e+i*0.78,y:t-i*0.28,r:i*0.38},{x:e+i*0.32,y:t-i*0.42,r:i*0.32},{x:e+i*0.62,y:t-i*0.48,r:i*0.36},{x:e+i*0.82,y:t-i*0.42,r:i*0.32}].forEach((l)=>{this.ctx.beginPath(),this.ctx.arc(l.x,l.y,l.r,0,Math.PI*2),this.ctx.fill()}),this.ctx.shadowBlur=n,this.ctx.shadowColor=o,this.ctx.globalAlpha=r}drawClouds(e,t,i,a=0.5){if(this.cloudField){this.cloudField.draw(this.ctx,e,t,i,this.quality.cloudLayers);return}let n=Math.max(2,Math.floor(t/150*a));for(let o=0;o<n;o++){let r=(e*3+o*150)%(t+200)-100,s=i*(0.2+o%3*0.15)+Math.sin(e*0.2+o)*8,l=40+o%3*15,u=0.6+o%2*0.2;this.drawCloud(r,s,l,u)}}}var qi=[{base:0.34,reach:0.3,phase:0,speed:1,alpha:1},{base:0.24,reach:0.22,phase:2.1,speed:-0.7,alpha:0.7},{base:0.42,reach:0.18,phase:4.3,speed:0.5,alpha:0.5}];class mt{constructor(){this.ray=null}draw(e,t,i,a,n){let o=this.getRay(),r=n.details?n.particles>=1?3:5:8,s=n.details?qi.length:1,l=0.75+Math.sin(t*0.07)*0.25;e.save(),e.globalCompositeOperation="lighter";for(let u=0;u<s;u++){let d=qi[u],h=t*d.speed;this.drawBand(e,o,d,h,i,a,r*5,l*0.5,!1),this.drawBand(e,o,d,h,i,a,r,l,!0)}e.restore()}drawBand(e,t,i,a,n,o,r,s,l){for(let u=-r;u<n+r;u+=r){let d=u/Math.max(n,1),h=o*(i.base+Math.sin(d*5.2+a*0.11+i.phase)*0.07+Math.sin(d*13-a*0.19+i.phase*2)*0.025),p=(0.5+0.5*Math.sin(d*11+a*0.45+i.phase))*(0.6+0.4*Math.sin(d*4.5-a*0.2+i.phase)),c=l?p*(0.8+0.2*Math.sin(d*140+a*1.5)):p,y=o*i.reach*(0.65+0.35*Math.sin(d*21+a*0.5)),w=Math.min(1,Math.sin(Math.max(0,Math.min(1,d))*Math.PI)*1.6),x=i.alpha*s*w*(0.08+c*0.3);if(x<=0.01)continue;e.globalAlpha=x,e.drawImage(t,u,h-y,r+1,y*1.08)}}getRay(){if(this.ray)return this.ray;let e=document.createElement("canvas");e.width=1,e.height=128;let t=e.getContext("2d");if(t){let i=t.createLinearGradient(0,0,0,128);i.addColorStop(0,"rgba(150, 70, 255, 0)"),i.addColorStop(0.35,"rgba(140, 90, 255, 0.35)"),i.addColorStop(0.65,"rgba(60, 220, 190, 0.6)"),i.addColorStop(0.88,"rgba(90, 255, 160, 1)"),i.addColorStop(0.93,"rgba(170, 255, 200, 0.9)"),i.addColorStop(1,"rgba(90, 255, 160, 0)"),t.fillStyle=i,t.fillRect(0,0,1,128)}return this.ray=e,e}}var on=29.530588853,rn=Date.UTC(2000,0,6,18,14),gt=22,sn=0.9;function Vi(e=new Date){let i=(e.getTime()-rn)/86400000/on%1;return i<0?i+1:i}function ln(e){let t=e;return()=>(t=(t*1664525+1013904223)%4294967296,t/4294967296)}class ft{constructor(){this.stars=[];this.starsKey="";this.moonSprite=null;this.moonKey="";this.shootingStar=null;this.nextShootingStar=0;this.aurora=new mt}draw(e,t,i,a,n,o,r,s=!1){if(this.drawStars(e,t,i,a,r),s)this.aurora.draw(e,t,i,a,r);if(r.details)this.drawShootingStar(e,t,i,a);this.drawMoon(e,n,o,a)}drawStars(e,t,i,a,n){let o=`${Math.round(i)}x${Math.round(a)}:${n.particles}`;if(o!==this.starsKey)this.createStars(i,a,n.particles),this.starsKey=o;e.save();for(let r of this.stars){let s=0.65+Math.sin(t*r.twinkleSpeed+r.twinklePhase)*0.35,l=1-r.y/a*0.6;if(e.globalAlpha=r.alpha*s*l,e.fillStyle=r.color,e.beginPath(),e.arc(r.x,r.y,r.size,0,Math.PI*2),e.fill(),n.details&&r.size>1.1){let u=e.createRadialGradient(r.x,r.y,0,r.x,r.y,r.size*4);u.addColorStop(0,"rgba(255, 255, 255, 0.35)"),u.addColorStop(1,"rgba(255, 255, 255, 0)"),e.fillStyle=u,e.beginPath(),e.arc(r.x,r.y,r.size*4,0,Math.PI*2),e.fill()}}e.restore()}createStars(e,t,i){let a=ln(Math.round(e)*31+Math.round(t)),n=Math.max(20,Math.min(260,Math.round(e*t/1600*i)));this.stars=[];for(let o=0;o<n;o++){let r=a();this.stars.push({x:a()*e,y:Math.pow(a(),1.4)*t*0.9,size:0.35+Math.pow(a(),3)*1.2,alpha:0.45+a()*0.55,twinkleSpeed:0.5+a()*2,twinklePhase:a()*Math.PI*2,color:r<0.15?"rgb(200, 215, 255)":r<0.3?"rgb(255, 236, 210)":"rgb(255, 255, 255)"})}}drawShootingStar(e,t,i,a){if(!this.nextShootingStar)this.nextShootingStar=t+4+Math.random()*8;if(!this.shootingStar&&t>=this.nextShootingStar)this.shootingStar={start:t,x:i*(0.15+Math.random()*0.7),y:a*(0.05+Math.random()*0.3),angle:Math.PI*(0.12+Math.random()*0.12)*(Math.random()<0.5?1:-1)+(Math.random()<0.5?0:Math.PI)},this.nextShootingStar=t+8+Math.random()*14;let n=this.shootingStar;if(!n)return;let o=(t-n.start)/sn;if(o>=1){this.shootingStar=null;return}let r=Math.min(220,i*0.45),s=Math.cos(n.angle),l=Math.abs(Math.sin(n.angle)),u=n.x+s*r*o,d=n.y+l*r*o,h=60*Math.sin(o*Math.PI),p=Math.sin(o*Math.PI),c=e.createLinearGradient(u,d,u-s*h,d-l*h);c.addColorStop(0,`rgba(255, 255, 255, ${0.9*p})`),c.addColorStop(1,"rgba(255, 255, 255, 0)"),e.save(),e.strokeStyle=c,e.lineWidth=1.5,e.lineCap="round",e.beginPath(),e.moveTo(u,d),e.lineTo(u-s*h,d-l*h),e.stroke(),e.restore()}drawMoon(e,t,i,a){let n=Math.max(0.5,Math.min(1,a/200)),o=gt*n,r=(1-Math.cos(i*Math.PI*2))/2,s=e.createRadialGradient(t.x,t.y,o*0.8,t.x,t.y,o*3.5);s.addColorStop(0,`rgba(220, 230, 255, ${0.08+r*0.18})`),s.addColorStop(1,"rgba(220, 230, 255, 0)"),e.fillStyle=s,e.beginPath(),e.arc(t.x,t.y,o*3.5,0,Math.PI*2),e.fill();let l=this.getMoonSprite(i,e.getTransform().a||1),u=(gt+2)*2*n;e.drawImage(l,t.x-u/2,t.y-u/2,u,u)}getMoonSprite(e,t){let i=`${Math.round(e*200)}@${t}`;if(this.moonSprite&&i===this.moonKey)return this.moonSprite;let a=gt,n=(a+2)*2,o=document.createElement("canvas");o.width=Math.ceil(n*t),o.height=Math.ceil(n*t);let r=o.getContext("2d");if(this.moonSprite=o,this.moonKey=i,!r)return o;r.scale(t,t);let s=n/2;r.fillStyle="rgba(160, 175, 205, 0.14)",r.beginPath(),r.arc(s,s,a,0,Math.PI*2),r.fill();let l=Math.cos(e*Math.PI*2);if(r.save(),e>0.5)r.translate(n,0),r.scale(-1,1);r.beginPath(),r.arc(s,s,a,-Math.PI/2,Math.PI/2,!1),r.ellipse(s,s,Math.max(0.01,a*Math.abs(l)),a,0,Math.PI/2,-Math.PI/2,l>0),r.closePath(),r.restore();let u=r.createRadialGradient(s-a*0.3,s-a*0.3,0,s,s,a);u.addColorStop(0,"#FFFEF6"),u.addColorStop(1,"#E2E0D6"),r.fillStyle=u,r.fill(),r.save(),r.clip();for(let[h,p,c]of[[-0.3,-0.2,0.34],[0.12,-0.38,0.24],[0.28,0.12,0.32],[-0.18,0.34,0.22],[0.48,-0.12,0.16]]){let y=s+h*a,w=s+p*a,x=r.createRadialGradient(y,w,0,y,w,c*a);x.addColorStop(0,"rgba(135, 140, 148, 0.3)"),x.addColorStop(0.6,"rgba(135, 140, 148, 0.18)"),x.addColorStop(1,"rgba(135, 140, 148, 0)"),r.fillStyle=x,r.fillRect(y-c*a,w-c*a,c*a*2,c*a*2)}let d=r.createRadialGradient(s,s,a*0.6,s,s,a);return d.addColorStop(0,"rgba(0, 0, 0, 0)"),d.addColorStop(1,"rgba(60, 60, 70, 0.18)"),r.fillStyle=d,r.fillRect(0,0,n,n),r.restore(),o}}class yt extends S{constructor(){super(...arguments);this.nightSky=new ft}draw(e,t,i,a,n,o,r=!1){let s=Date.now()*0.001,l=Ne(a,t,i,n),{x:u,y:d}=l;if(a.type==="day"||a.type==="sunrise"||a.type==="sunset"){let h=a.type!=="day";if(this.quality.details)this.drawSunRays(u,d,s,h);if(this.drawSun(u,d,s),this.quality.details)this.drawLensFlare(u,d,t,i,h);if(a.type==="sunrise"||a.type==="sunset")this.drawHorizonReflection(u,d,i,s)}else if(a.type==="night")this.nightSky.draw(this.ctx,s,t,i,l,o??Vi(),this.quality,r);this.drawClouds(s,t,i,0.3)}drawSun(e,t,i){let a=48+Math.sin(i*0.15)*1.5,n=this.ctx.createRadialGradient(e,t,a*0.3,e,t,a*3.5);n.addColorStop(0,"rgba(255, 248, 230, 0.25)"),n.addColorStop(0.15,"rgba(255, 240, 200, 0.2)"),n.addColorStop(0.3,"rgba(255, 230, 170, 0.15)"),n.addColorStop(0.5,"rgba(255, 220, 140, 0.1)"),n.addColorStop(0.7,"rgba(255, 210, 120, 0.06)"),n.addColorStop(0.85,"rgba(255, 200, 100, 0.03)"),n.addColorStop(1,"rgba(255, 190, 90, 0)"),this.ctx.fillStyle=n,this.ctx.beginPath(),this.ctx.arc(e,t,a*3.5,0,Math.PI*2),this.ctx.fill();let o=this.ctx.createRadialGradient(e,t,a*0.5,e,t,a*2.2);o.addColorStop(0,"rgba(255, 250, 220, 0.35)"),o.addColorStop(0.3,"rgba(255, 240, 190, 0.25)"),o.addColorStop(0.6,"rgba(255, 230, 160, 0.15)"),o.addColorStop(0.85,"rgba(255, 220, 140, 0.08)"),o.addColorStop(1,"rgba(255, 210, 120, 0)"),this.ctx.fillStyle=o,this.ctx.beginPath(),this.ctx.arc(e,t,a*2.2,0,Math.PI*2),this.ctx.fill();let r=this.ctx.createRadialGradient(e,t,a*0.6,e,t,a*1.6);r.addColorStop(0,"rgba(255, 252, 240, 0.5)"),r.addColorStop(0.4,"rgba(255, 245, 210, 0.35)"),r.addColorStop(0.7,"rgba(255, 235, 180, 0.2)"),r.addColorStop(1,"rgba(255, 225, 150, 0)"),this.ctx.fillStyle=r,this.ctx.beginPath(),this.ctx.arc(e,t,a*1.6,0,Math.PI*2),this.ctx.fill();let s=this.ctx.createRadialGradient(e-a*0.1,t-a*0.1,0,e,t,a);s.addColorStop(0,"#FFFEF5"),s.addColorStop(0.15,"#FFF9E6"),s.addColorStop(0.3,"#FFF4D6"),s.addColorStop(0.5,"#FFEDC0"),s.addColorStop(0.7,"#FFE4A8"),s.addColorStop(0.85,"#FFDC95"),s.addColorStop(1,"#FFD37F"),this.ctx.fillStyle=s,this.ctx.beginPath(),this.ctx.arc(e,t,a,0,Math.PI*2),this.ctx.fill()}drawSunRays(e,t,i,a){let r=a?"255, 200, 140":"255, 245, 215",s=this.ctx.createRadialGradient(e,t,30,e,t,260);s.addColorStop(0,`rgba(${r}, 0.09)`),s.addColorStop(0.5,`rgba(${r}, 0.03)`),s.addColorStop(1,`rgba(${r}, 0)`),this.ctx.save(),this.ctx.globalCompositeOperation="lighter",this.ctx.fillStyle=s,this.ctx.beginPath();for(let l=0;l<14;l++){let u=i*0.02+l/14*Math.PI*2+Math.sin(i*0.3+l)*0.04,d=0.025+l%3*0.012,h=260*(0.6+0.4*Math.sin(i*0.4+l*1.7)**2);this.ctx.moveTo(e,t),this.ctx.lineTo(e+Math.cos(u-d)*h,t+Math.sin(u-d)*h),this.ctx.lineTo(e+Math.cos(u+d)*h,t+Math.sin(u+d)*h),this.ctx.closePath()}this.ctx.fill(),this.ctx.restore()}drawLensFlare(e,t,i,a,n){let o=i/2-e,r=a/2-t,s=[[1.2,10,n?"255, 190, 120":"255, 240, 200",0.08],[1.6,22,n?"255, 160, 120":"180, 220, 255",0.05],[1.9,5,"255, 255, 255",0.1],[2.3,34,n?"255, 180, 140":"200, 255, 220",0.035]];this.ctx.save(),this.ctx.globalCompositeOperation="lighter";for(let[l,u,d,h]of s){let p=e+o*l,c=t+r*l,y=this.ctx.createRadialGradient(p,c,0,p,c,u);y.addColorStop(0,`rgba(${d}, ${h})`),y.addColorStop(0.7,`rgba(${d}, ${h*0.6})`),y.addColorStop(1,`rgba(${d}, 0)`),this.ctx.fillStyle=y,this.ctx.beginPath(),this.ctx.arc(p,c,u,0,Math.PI*2),this.ctx.fill()}this.ctx.restore()}drawHorizonReflection(e,t,i,a){let n=48+Math.sin(a*0.15)*1.5,o=i*0.85;if(t>=o-50){let r=Math.max(0,(o-t)/50)*0.3;this.ctx.fillStyle=`rgba(255, 140, 0, ${r})`,this.ctx.beginPath(),this.ctx.ellipse(e,o,n*1.5,n*0.5,0,0,Math.PI*2),this.ctx.fill()}}}var Oe=[{density:6,speed:[380,460],length:[8,12],width:0.6,alpha:0.28},{density:3.5,speed:[560,680],length:[14,20],width:0.9,alpha:0.42},{density:1.4,speed:[820,980],length:[22,30],width:1.3,alpha:0.58}],wt=0.12,Gi=0.3;class ie extends S{constructor(){super(...arguments);this.rainDrops=[];this.splashes=[];this.lastTime=0;this.dropsKey=""}draw(e,t,i,a,n=!1){let o=Date.now()*0.001;this.drawClouds(o,t,i,n?1:0.8),this.drawRain(t,i,n)}drawRain(e,t,i){let a=`${Math.round(e)}x${Math.round(t)}:${i}:${this.quality.particles}`;if(a!==this.dropsKey)this.createDrops(e,t,i),this.dropsKey=a;let n=Date.now()*0.001,o=this.lastTime>0?Math.min(n-this.lastTime,0.1):0.016666666666666666;this.lastTime=n,this.ctx.save(),this.ctx.lineCap="round",Oe.forEach((r,s)=>{this.ctx.beginPath();for(let l of this.rainDrops){if(l.layer!==s)continue;if(l.y+=l.speed*o,l.x+=l.speed*wt*o,l.y-l.length>t){if(this.quality.details&&s===Oe.length-1&&Math.random()<(i?0.7:0.4))this.splashes.push({x:l.x-(l.y-t)*wt,y:t-2-Math.random()*6,age:0,size:3+Math.random()*3});this.resetDrop(l,e)}if(l.x>e+20)l.x-=e+40;this.ctx.moveTo(l.x-l.length*wt,l.y-l.length),this.ctx.lineTo(l.x,l.y)}this.ctx.strokeStyle=`rgba(215, 228, 242, ${r.alpha*(i?1.15:1)})`,this.ctx.lineWidth=r.width,this.ctx.stroke()}),this.drawSplashes(o),this.ctx.restore()}createDrops(e,t,i){this.rainDrops=[],this.splashes=[];let a=e*t/1e4;Oe.forEach((n,o)=>{let r=Math.min(400,Math.round(a*n.density*(i?2:1)*this.quality.particles));for(let s=0;s<r;s++){let l={layer:o,x:0,y:0,speed:0,length:0};this.resetDrop(l,e),l.y=Math.random()*(t+l.length),this.rainDrops.push(l)}})}resetDrop(e,t){let i=Oe[e.layer];e.speed=i.speed[0]+Math.random()*(i.speed[1]-i.speed[0]),e.length=i.length[0]+Math.random()*(i.length[1]-i.length[0]),e.y=-Math.random()*40,e.x=Math.random()*(t+40)-40}drawSplashes(e){if(this.splashes=this.splashes.filter((t)=>(t.age+=e)<Gi),this.splashes.length>60)this.splashes.splice(0,this.splashes.length-60);this.ctx.lineWidth=0.8;for(let t of this.splashes){let i=t.age/Gi,a=t.size*(0.4+i);this.ctx.strokeStyle=`rgba(220, 232, 245, ${0.45*(1-i)})`,this.ctx.beginPath(),this.ctx.ellipse(t.x,t.y,a,a*0.35,0,Math.PI,0),this.ctx.stroke();let n=Math.sin(i*Math.PI)*t.size*1.2;this.ctx.fillStyle=`rgba(220, 232, 245, ${0.5*(1-i)})`,this.ctx.fillRect(t.x-a*0.8,t.y-n,1,1),this.ctx.fillRect(t.x+a*0.7,t.y-n*0.8,1,1)}}}var Ki=[{density:5,speed:[12,20],size:[1.2,2],alpha:0.6},{density:2.5,speed:[22,34],size:[2.4,3.6],alpha:0.85},{density:0.9,speed:[38,55],size:[4,6.5],alpha:0.95}],ve=32;class vt extends S{constructor(){super(...arguments);this.snowflakes=[];this.lastTime=0;this.flakesKey="";this.sprite=null}draw(e,t,i,a){let n=Date.now()*0.001;this.drawClouds(n,t,i,0.7),this.drawSnowflakes(t,i)}drawSnowflakes(e,t){let i=`${Math.round(e)}x${Math.round(t)}:${this.quality.particles}`;if(i!==this.flakesKey)this.createFlakes(e,t),this.flakesKey=i;let a=this.getSprite(),n=Date.now()*0.001,o=this.lastTime>0?Math.min(n-this.lastTime,0.1):0.016666666666666666;this.lastTime=n,this.ctx.save();for(let r of this.snowflakes){r.y+=r.speed*o;let s=Math.sin(n*r.swaySpeed+r.swayPhase)*r.swayAmount;if(r.x+=(r.speed*0.15+s)*o,r.y-r.size>t)r.y=-r.size-Math.random()*20,r.x=Math.random()*e;if(r.x>e+10)r.x-=e+20;if(r.x<-10)r.x+=e+20;let l=r.size*2;this.ctx.globalAlpha=Ki[r.layer].alpha,this.ctx.drawImage(a,r.x-l/2,r.y-l/2,l,l)}this.ctx.restore()}createFlakes(e,t){this.snowflakes=[];let i=e*t/1e4;Ki.forEach((a,n)=>{let o=Math.min(250,Math.round(i*a.density*this.quality.particles));for(let r=0;r<o;r++)this.snowflakes.push({layer:n,x:Math.random()*e,y:Math.random()*t,speed:a.speed[0]+Math.random()*(a.speed[1]-a.speed[0]),size:a.size[0]+Math.random()*(a.size[1]-a.size[0]),swayPhase:Math.random()*Math.PI*2,swaySpeed:0.6+Math.random()*0.8,swayAmount:6+n*6})})}getSprite(){if(this.sprite)return this.sprite;let e=document.createElement("canvas");e.width=ve,e.height=ve;let t=e.getContext("2d");if(t){let i=ve/2,a=t.createRadialGradient(i,i,0,i,i,i);a.addColorStop(0,"rgba(255, 255, 255, 1)"),a.addColorStop(0.45,"rgba(255, 255, 255, 0.85)"),a.addColorStop(1,"rgba(255, 255, 255, 0)"),t.fillStyle=a,t.fillRect(0,0,ve,ve)}return this.sprite=e,e}}class ke extends S{draw(e,t,i,a){let n=Date.now()*0.001;this.drawClouds(n,t,i,0.7)}}var Qi=[{y:0.3,speed:5,alpha:0.55,scaleY:0.9,seed:1},{y:0.58,speed:-8,alpha:0.6,scaleY:1.1,seed:2},{y:0.85,speed:12,alpha:0.6,scaleY:1.3,seed:3}],re=600,Be=140;function un(e){let t=e*7919;return()=>(t=(t*1664525+1013904223)%4294967296,t/4294967296)}class kt extends S{constructor(){super(...arguments);this.sprites=[];this.spriteKey=""}draw(e,t,i,a){let n=Date.now()*0.001,o=q("foggy",a).cloudLight;this.ensureSprites(o);let r=this.ctx.createLinearGradient(0,i*0.25,0,i);r.addColorStop(0,F(o,0)),r.addColorStop(1,F(o,0.2)),this.ctx.fillStyle=r,this.ctx.fillRect(0,0,t,i);let s=Math.max(0.4,Math.min(1.2,i/200));Qi.forEach((l,u)=>{let d=re*s,h=Be*s*l.scaleY,p=l.y*i-h/2+Math.sin(n*0.2+u)*4,c=n*l.speed%d;if(c>0)c-=d;this.ctx.save(),this.ctx.globalAlpha=l.alpha;for(;c<t;c+=d)this.ctx.drawImage(this.sprites[u],c,p,d,h);this.ctx.restore()})}ensureSprites(e){let t=this.ctx.getTransform().a||1,i=`${Math.round(e.r/6)},${Math.round(e.g/6)},${Math.round(e.b/6)}@${t}`;if(i===this.spriteKey)return;this.spriteKey=i,this.sprites=Qi.map((a)=>this.renderSprite(a.seed,e,t))}renderSprite(e,t,i){let a=document.createElement("canvas");a.width=Math.ceil(re*i),a.height=Math.ceil(Be*i);let n=a.getContext("2d");if(!n)return a;n.scale(i,i);let o=un(e),r=16;for(let s=0;s<r;s++){let l=s/r*re+o()*30,u=Be*(0.35+o()*0.3),d=Be*(0.2+o()*0.3),h=0.25+o()*0.65;for(let p of[-re,0,re]){let c=l+p;if(c+d*2.2<0||c-d*2.2>re)continue;n.save(),n.translate(c,u),n.scale(2.2,0.55);let y=n.createRadialGradient(0,0,0,0,0,d);y.addColorStop(0,F(t,h)),y.addColorStop(1,F(t,0)),n.fillStyle=y,n.beginPath(),n.arc(0,0,d,0,Math.PI*2),n.fill(),n.restore()}}return a}}var qe=[{density:1.6,speed:[280,360],size:[1.5,2.2],alpha:0.6},{density:0.9,speed:[420,520],size:[2.6,3.4],alpha:0.85},{density:0.4,speed:[600,720],size:[3.8,5.2],alpha:1}],dn=1400,be=32;class bt extends S{constructor(e){super(e);this.hailStones=[];this.stonesKey="";this.lastTime=0;this.sprite=null;this.rainyAnimation=new ie(e),this.children.push(this.rainyAnimation)}draw(e,t,i,a){let n=Date.now()*0.001;this.drawClouds(n,t,i,1),this.rainyAnimation.drawRain(t,i,!1),this.drawHailStones(t,i)}drawHailStones(e,t){let i=`${Math.round(e)}x${Math.round(t)}:${this.quality.particles}`;if(i!==this.stonesKey)this.createStones(e,t),this.stonesKey=i;let a=this.getSprite(),n=Date.now()*0.001,o=this.lastTime>0?Math.min(n-this.lastTime,0.1):0.016666666666666666;this.lastTime=n,this.ctx.save();for(let r of this.hailStones){if(r.bounces>0)r.vy+=dn*o;if(r.x+=r.vx*o,r.y+=r.vy*o,r.y>=r.ground&&r.vy>0)if(r.bounces<2)r.y=r.ground,r.vy=-r.vy*(r.bounces===0?0.3:0.25),r.vx=(Math.random()-0.5)*60,r.bounces++;else this.resetStone(r,e,t);if(r.x>e+10)r.x-=e+20;if(r.x<-10)r.x+=e+20;let s=r.size*2;this.ctx.globalAlpha=qe[r.layer].alpha,this.ctx.drawImage(a,r.x-s/2,r.y-s/2,s,s)}this.ctx.restore()}createStones(e,t){this.hailStones=[];let i=e*t/1e4;qe.forEach((a,n)=>{let o=Math.min(200,Math.round(i*a.density*this.quality.particles));for(let r=0;r<o;r++){let s={layer:n,x:0,y:0,vx:0,vy:0,size:0,ground:0,bounces:0};this.resetStone(s,e,t),s.y=Math.random()*s.ground,this.hailStones.push(s)}})}resetStone(e,t,i){let a=qe[e.layer];e.x=Math.random()*t,e.y=-10-Math.random()*40,e.vy=a.speed[0]+Math.random()*(a.speed[1]-a.speed[0]),e.vx=e.vy*0.1,e.size=a.size[0]+Math.random()*(a.size[1]-a.size[0]),e.ground=i-2-(qe.length-1-e.layer)*6-Math.random()*4,e.bounces=0}getSprite(){if(this.sprite)return this.sprite;let e=document.createElement("canvas");e.width=be,e.height=be;let t=e.getContext("2d");if(t){let i=be/2,a=t.createRadialGradient(i,i,0,i,i,i);a.addColorStop(0,"rgba(245, 250, 255, 1)"),a.addColorStop(0.6,"rgba(215, 230, 245, 0.95)"),a.addColorStop(0.8,"rgba(200, 220, 240, 0.5)"),a.addColorStop(1,"rgba(200, 220, 240, 0)"),t.fillStyle=a,t.fillRect(0,0,be,be),t.fillStyle="rgba(255, 255, 255, 0.9)",t.beginPath(),t.arc(i-i*0.25,i-i*0.25,i*0.18,0,Math.PI*2),t.fill()}return this.sprite=e,e}}var Ve=0.4;class xt extends S{constructor(e){super(e);this.bolts=[];this.flashActive=!1;this.rainyAnimation=new ie(e),this.children.push(this.rainyAnimation)}draw(e,t,i,a,n=!0){let o=Date.now()*0.001,r=this.getFlashIntensity(o);if(this.updateBolts(o,r,t,i),this.drawBolts(o),this.drawClouds(o,t,i,1),n)this.rainyAnimation.drawRain(t,i,!1);this.drawLightning(t,i,r)}getFlashIntensity(e){return Math.max(0,Math.sin(e*2.5)*Math.sin(e*5.3)*Math.sin(e*7.1))}updateBolts(e,t,i,a){this.bolts=this.bolts.filter((o)=>e<o.startsAt+o.duration);let n=t>Ve;if(n&&!this.flashActive){if(this.bolts.push(this.createBolt(e,i,a)),Math.random()<0.3)this.bolts.push(this.createBolt(e+0.08+Math.random()*0.1,i,a))}this.flashActive=n}createBolt(e,t,i){let a=t*(0.1+Math.random()*0.8),n=i*0.25,o=i*(0.6+Math.random()*0.3),r=8+Math.floor(Math.random()*5),s=(o-n)/r,l=Math.min(30,t*0.06),u=[{x:a,y:n}],d=[];for(let h=1;h<=r;h++){let c={x:u[h-1].x+(Math.random()-0.5)*l*2,y:n+s*h};if(u.push(c),h<r-1&&Math.random()<0.25){let y=Math.random()<0.5?-1:1,w=[c],x=2+Math.floor(Math.random()*3);for(let T=1;T<=x;T++){let P=w[T-1];w.push({x:P.x+y*l*(0.3+Math.random()*0.5),y:P.y+s*(0.5+Math.random()*0.5)})}d.push(w)}}return{trunk:u,branches:d,startsAt:e,duration:0.2+Math.random()*0.15}}drawBolts(e){this.bolts.forEach((t)=>{let i=e-t.startsAt;if(i<0)return;let a=0.75+Math.random()*0.25,n=Math.max(0,1-i/t.duration)*a;this.ctx.save(),this.ctx.lineCap="round",this.ctx.lineJoin="round",this.ctx.globalAlpha=n,this.ctx.shadowColor="rgba(200, 220, 255, 1)",t.branches.forEach((o)=>this.strokePath(o,1.2,8)),this.strokePath(t.trunk,2.5,16),this.ctx.restore()})}strokePath(e,t,i){this.ctx.beginPath(),this.ctx.moveTo(e[0].x,e[0].y);for(let a=1;a<e.length;a++)this.ctx.lineTo(e[a].x,e[a].y);this.ctx.strokeStyle="rgba(255, 255, 255, 1)",this.ctx.lineWidth=t,this.ctx.shadowBlur=i,this.ctx.stroke()}drawLightning(e,t,i){if(i>Ve){let a=(i-Ve)/(1-Ve),n=a*0.6,o=Math.min(n,Math.sin(a*Math.PI)*0.6);this.ctx.fillStyle=`rgba(255, 255, 255, ${o})`,this.ctx.fillRect(0,0,e,t)}}}var Ji=6,St=240,Mt=120,ae=[{scale:0.55,speed:3,alpha:0.6,top:0.02,bottom:0.3,density:1.4,bias:-0.1},{scale:0.8,speed:6,alpha:0.85,top:0.08,bottom:0.42,density:0.9,bias:0.1},{scale:1.15,speed:10,alpha:0.95,top:0.15,bottom:0.5,density:0.55,bias:0.25}];function Yi(e){let t=e;return()=>(t=(t*1664525+1013904223)%4294967296,t/4294967296)}class Ct{constructor(){this.sprites=[];this.spriteKey="";this.clouds=[];this.cloudsSize="";this.coverage=-1;this.targetCoverage=0;this.light={r:255,g:255,b:255};this.shade={r:200,g:210,b:220};this.lastTime=0;this.wind=1;this.targetWind=1;this.drift=ae.map(()=>0)}setWeather(e,t){let i=q(e,t);if(this.light=i.cloudLight,this.shade=i.cloudShade,this.targetCoverage=i.coverage,this.coverage<0)this.coverage=i.coverage}setWind(e){this.targetWind=Math.max(1,e)}settle(){this.coverage=this.targetCoverage}draw(e,t,i,a,n=ae.length){let o=e.getTransform().a||1;if(this.ensureSprites(o),this.cloudsSize!==`${i}x${a}`)this.createClouds(i,a);let r=Math.max(0.35,Math.min(1,a/200)),s=this.lastTime?Math.min(0.1,Math.max(0,t-this.lastTime)):0;this.lastTime=t,this.coverage+=(this.targetCoverage-this.coverage)*Math.min(1,s*1.5),this.wind+=(this.targetWind-this.wind)*Math.min(1,s*0.8),ae.forEach((u,d)=>{this.drift[d]+=u.speed*this.wind*s});let l=ae.length-Math.max(1,Math.min(ae.length,n));for(let u of this.clouds){if(u.layer<l)continue;let d=Math.max(0,Math.min(1,(this.coverage-u.threshold)*6));if(d<=0)continue;let h=ae[u.layer],p=St*h.scale*r,c=Mt*h.scale*r,y=i+p*2,w=(u.offset*y+this.drift[u.layer])%y-p,x=u.y*a+Math.sin(t*0.15+u.bobPhase)*3-c/2;if(e.save(),e.globalAlpha=h.alpha*d,u.flip)e.translate(w+p,x),e.scale(-1,1),e.drawImage(this.sprites[u.sprite],0,0,p,c);else e.drawImage(this.sprites[u.sprite],w,x,p,c);e.restore()}}createClouds(e,t){let i=Yi(Math.round(e)*7+Math.round(t));this.clouds=[],ae.forEach((a,n)=>{let o=Math.max(2,Math.round(e/100*a.density));for(let r=0;r<o;r++)this.clouds.push({layer:n,sprite:Math.floor(i()*Ji),offset:(r+i()*0.6)/o,y:a.top+i()*(a.bottom-a.top),threshold:r/o*0.8+i()*0.05+a.bias,bobPhase:i()*Math.PI*2,flip:i()<0.5})}),this.cloudsSize=`${e}x${t}`}ensureSprites(e){let t=[this.light.r,this.light.g,this.light.b,this.shade.r,this.shade.g,this.shade.b].map((i)=>Math.round(i/6)).join(",")+`@${e}`;if(t===this.spriteKey)return;this.spriteKey=t,this.sprites=Array.from({length:Ji},(i,a)=>this.renderSprite(a,e))}renderSprite(e,t){let i=document.createElement("canvas");i.width=Math.ceil(St*t),i.height=Math.ceil(Mt*t);let a=i.getContext("2d");if(!a)return i;a.scale(t,t);let n=Yi(e*9973+17),o=St,r=Mt,s=r*0.78,l=14+Math.floor(n()*6),u=[];for(let p=0;p<l;p++){let c=n(),y=o*(0.2+c*0.6),w=Math.sin(c*Math.PI),x=r*(0.16+w*(0.14+n()*0.12)),T=s-x*(0.45+n()*0.25)-w*r*0.12;u.push({x:y,y:T,r:x});let P=a.createRadialGradient(y,T,0,y,T,x);P.addColorStop(0,"rgba(255, 255, 255, 1)"),P.addColorStop(0.7,"rgba(255, 255, 255, 0.95)"),P.addColorStop(0.88,"rgba(255, 255, 255, 0.5)"),P.addColorStop(1,"rgba(255, 255, 255, 0)"),a.fillStyle=P,a.beginPath(),a.arc(y,T,x,0,Math.PI*2),a.fill()}a.globalCompositeOperation="destination-in";let d=a.createLinearGradient(0,0,0,r);d.addColorStop(0,"rgba(0, 0, 0, 1)"),d.addColorStop(0.72,"rgba(0, 0, 0, 1)"),d.addColorStop(0.9,"rgba(0, 0, 0, 0)"),a.fillStyle=d,a.fillRect(0,0,o,r),a.globalCompositeOperation="source-atop";let h=a.createLinearGradient(0,r*0.1,0,s);return h.addColorStop(0,F(this.light)),h.addColorStop(0.45,F(this.light)),h.addColorStop(1,F(this.shade)),a.fillStyle=h,a.fillRect(0,0,o,r),u.sort((p,c)=>c.y-p.y).forEach(({x:p,y:c,r:y})=>{let w=p-y*0.15,x=c-y*0.35,T=a.createRadialGradient(w,x,0,w,x,y*0.85);T.addColorStop(0,F(this.light,0.55)),T.addColorStop(1,F(this.light,0)),a.fillStyle=T,a.beginPath(),a.arc(w,x,y*0.85,0,Math.PI*2),a.fill()}),i}}class Tt{constructor(){this.sprite=null;this.spriteDpr=0;this.beads=[];this.runners=[];this.size="";this.lastTime=0}draw(e,t,i,a,n,o){let r=e.getTransform().a||1,s=this.getSprite(r),l=Math.max(0.6,Math.min(1,a/200)),u=Math.round(i*a/2600*n*o.particles),d=Math.max(1,Math.round(i/130*n*o.particles)),h=`${Math.round(i)}x${Math.round(a)}`;if(h!==this.size){this.size=h,this.beads=[],this.runners=[];for(let c=0;c<u;c++){let y=this.createBead(i,a,l);y.age=Math.random()*y.life,this.beads.push(y)}}let p=this.lastTime?Math.min(0.1,Math.max(0,t-this.lastTime)):0;if(this.lastTime=t,this.beads.length<u&&Math.random()<p*u*0.4)this.beads.push(this.createBead(i,a,l));while(this.runners.length<d)this.runners.push(this.createRunner(i,a,l,!0));e.save(),this.beads=this.beads.filter((c)=>(c.age+=p)<c.life);for(let c of this.beads){let y=Math.min(1,c.age/0.25,(c.life-c.age)/0.8);this.drawDrop(e,s,c.x,c.y,c.r,c.r,y)}for(let c of this.runners){if(c.wait>0)c.wait-=p;else{if(c.y+=c.speed*p,c.x+=Math.sin(c.y*0.08+c.wobble)*6*p,Math.random()<p*0.8)c.wait=0.2+Math.random()*1.2;if(c.y-c.lastTrail>c.r*(2+Math.random()*2)&&this.beads.length<u*1.6)c.lastTrail=c.y,this.beads.push({x:c.x+(Math.random()-0.5)*c.r*1.2,y:c.y-c.r*(1.2+Math.random()*0.6),r:c.r*(0.25+Math.random()*0.25),age:0.25,life:2+Math.random()*3})}let y=c.wait>0?1.05:1.3;this.drawDrop(e,s,c.x,c.y,c.r,c.r*y,1)}e.restore(),this.runners=this.runners.map((c)=>c.y-c.r>a?this.createRunner(i,a,l,!1):c)}drawDrop(e,t,i,a,n,o,r){e.globalAlpha=r,e.drawImage(t,i-n,a-o,n*2,o*2)}createBead(e,t,i){return{x:Math.random()*e,y:Math.random()*t,r:(1.3+Math.pow(Math.random(),2)*3.4)*i,age:0,life:4+Math.random()*12}}createRunner(e,t,i,a){let n=(4+Math.random()*3)*i;return{x:Math.random()*e,y:a?Math.random()*t*0.8:-n-Math.random()*t*0.3,r:n,wait:Math.random()*3,speed:25+Math.random()*45,wobble:Math.random()*Math.PI*2,lastTrail:-1/0}}getSprite(e){if(this.sprite&&this.spriteDpr===e)return this.sprite;let t=16,i=document.createElement("canvas");i.width=i.height=Math.ceil(t*2*e);let a=i.getContext("2d");if(this.sprite=i,this.spriteDpr=e,!a)return i;a.scale(e,e);let n=a.createRadialGradient(t,t-2,0,t,t,t);n.addColorStop(0,"rgba(255, 255, 255, 0.1)"),n.addColorStop(0.65,"rgba(255, 255, 255, 0.18)"),n.addColorStop(0.86,"rgba(15, 25, 40, 0.45)"),n.addColorStop(1,"rgba(15, 25, 40, 0)"),a.fillStyle=n,a.fillRect(0,0,t*2,t*2);let o=a.createRadialGradient(t,t*1.45,0,t,t*1.45,t*0.55);o.addColorStop(0,"rgba(255, 255, 255, 0.55)"),o.addColorStop(1,"rgba(255, 255, 255, 0)"),a.fillStyle=o,a.fillRect(0,0,t*2,t*2);let r=t*0.68,s=t*0.62,l=a.createRadialGradient(r,s,0,r,s,t*0.3);return l.addColorStop(0,"rgba(255, 255, 255, 0.95)"),l.addColorStop(1,"rgba(255, 255, 255, 0)"),a.fillStyle=l,a.fillRect(0,0,t*2,t*2),i}}var hn=["#6E9F3A","#86B34A","#5C8A2E"],cn=["#D9892B","#E3B23C","#B8522A"];class At{constructor(){this.gusts=[];this.leaves=[];this.sprites=[];this.spriteKey="";this.lastTime=0}draw(e,t,i,a,n,o,r,s){let l=this.lastTime?Math.min(0.1,Math.max(0,t-this.lastTime)):0;this.lastTime=t;let u=Math.max(0.5,Math.min(1,a/200)),d=Math.max(2,Math.round(i/60*n*Math.max(0.5,s.particles)));while(this.gusts.length<d)this.gusts.push(this.createGust(i,a,u,!0));if(this.gusts.length>d)this.gusts.length=d;e.save(),e.lineCap="round";let h=0.35+r*0.45;if(this.gusts=this.gusts.map((p)=>{if(p.age+=l,p.x+=p.speed*l,p.age>=p.life||p.x-p.length>i)return this.createGust(i,a,u,!1);return this.drawGust(e,p,h),p}),o&&s.details)this.drawLeaves(e,l,i,a,u,r,s);e.restore()}createGust(e,t,i,a){let n=(90+Math.random()*110)*i;return{x:a?Math.random()*e:-n-Math.random()*e*0.5,y:t*(0.1+Math.random()*0.75),length:n,speed:(260+Math.random()*200)*i,amplitude:(3+Math.random()*6)*i,phase:Math.random()*Math.PI*2,age:0,life:1.4+Math.random()*1.6}}drawGust(e,t,i){let a=Math.sin(Math.min(1,t.age/t.life)*Math.PI);if(a<=0.02)return;let n=t.x-t.length,o=e.createLinearGradient(n,0,t.x,0);o.addColorStop(0,"rgba(255, 255, 255, 0)"),o.addColorStop(0.6,`rgba(255, 255, 255, ${0.85*i*a})`),o.addColorStop(1,"rgba(255, 255, 255, 0)"),e.strokeStyle=o,e.lineWidth=1.8,e.beginPath();let r=12;for(let s=0;s<=r;s++){let l=n+t.length*s/r,u=t.y+Math.sin(l*0.035+t.phase)*t.amplitude;if(s===0)e.moveTo(l,u);else e.lineTo(l,u)}e.stroke()}drawLeaves(e,t,i,a,n,o,r){let s=e.getTransform().a||1;this.ensureSprites(s);let l=Math.max(2,Math.round(i/70*r.particles));while(this.leaves.length<l)this.leaves.push(this.createLeaf(i,a,n,!0));if(this.leaves.length>l)this.leaves.length=l;e.globalAlpha=0.55+o*0.45,this.leaves=this.leaves.map((u)=>{if(u.x+=u.speed*t,u.flutter+=t*3,u.y+=Math.sin(u.flutter)*30*t*n+12*t*n,u.angle+=u.spin*t,u.x-u.size>i||u.y-u.size>a)return this.createLeaf(i,a,n,!1);return e.save(),e.translate(u.x,u.y),e.rotate(u.angle),e.scale(1,Math.max(0.15,Math.abs(Math.cos(u.flutter*0.7)))),e.drawImage(this.sprites[u.sprite],-u.size,-u.size/2,u.size*2,u.size),e.restore(),u})}createLeaf(e,t,i,a){let n=(6+Math.random()*5)*i;return{x:a?Math.random()*e:-n*2-Math.random()*e*0.6,y:t*(0.1+Math.random()*0.7),speed:(140+Math.random()*120)*i,angle:Math.random()*Math.PI*2,spin:(Math.random()<0.5?-1:1)*(2+Math.random()*4),size:n,flutter:Math.random()*Math.PI*2,sprite:Math.floor(Math.random()*3)}}ensureSprites(e){let t=new Date().getMonth(),i=t>=8&&t<=10?cn:hn,a=`${i[0]}@${e}`;if(a===this.spriteKey)return;this.spriteKey=a,this.sprites=i.map((n)=>{let o=document.createElement("canvas");o.width=Math.ceil(24*e),o.height=Math.ceil(12*e);let r=o.getContext("2d");if(!r)return o;return r.scale(e,e),r.fillStyle=n,r.beginPath(),r.moveTo(1,6),r.quadraticCurveTo(12,-2,23,6),r.quadraticCurveTo(12,14,1,6),r.fill(),r.strokeStyle="rgba(0, 0, 0, 0.25)",r.lineWidth=0.8,r.beginPath(),r.moveTo(2,6),r.lineTo(22,6),r.stroke(),o})}}class zt extends S{draw(e,t,i,a,n){let o=Date.now()*0.001,r=Ne(a,t,i,n),{x:s,y:l}=r;if(a.type==="day"||a.type==="sunrise"||a.type==="sunset"){if(this.drawSun(s,l,o),a.type==="sunrise"||a.type==="sunset")this.drawHorizonReflection(s,l,i,o)}else if(a.type==="night")this.drawNightSky(t,i,o,r);this.drawClouds(o,t,i,0.3)}drawSun(e,t,i){let a=48+Math.sin(i*0.15)*1.5,n=this.ctx.createRadialGradient(e,t,a*0.3,e,t,a*3.5);n.addColorStop(0,"rgba(255, 248, 230, 0.25)"),n.addColorStop(0.15,"rgba(255, 240, 200, 0.2)"),n.addColorStop(0.3,"rgba(255, 230, 170, 0.15)"),n.addColorStop(0.5,"rgba(255, 220, 140, 0.1)"),n.addColorStop(0.7,"rgba(255, 210, 120, 0.06)"),n.addColorStop(0.85,"rgba(255, 200, 100, 0.03)"),n.addColorStop(1,"rgba(255, 190, 90, 0)"),this.ctx.fillStyle=n,this.ctx.beginPath(),this.ctx.arc(e,t,a*3.5,0,Math.PI*2),this.ctx.fill();let o=this.ctx.createRadialGradient(e,t,a*0.5,e,t,a*2.2);o.addColorStop(0,"rgba(255, 250, 220, 0.35)"),o.addColorStop(0.3,"rgba(255, 240, 190, 0.25)"),o.addColorStop(0.6,"rgba(255, 230, 160, 0.15)"),o.addColorStop(0.85,"rgba(255, 220, 140, 0.08)"),o.addColorStop(1,"rgba(255, 210, 120, 0)"),this.ctx.fillStyle=o,this.ctx.beginPath(),this.ctx.arc(e,t,a*2.2,0,Math.PI*2),this.ctx.fill();let r=this.ctx.createRadialGradient(e,t,a*0.6,e,t,a*1.6);r.addColorStop(0,"rgba(255, 252, 240, 0.5)"),r.addColorStop(0.4,"rgba(255, 245, 210, 0.35)"),r.addColorStop(0.7,"rgba(255, 235, 180, 0.2)"),r.addColorStop(1,"rgba(255, 225, 150, 0)"),this.ctx.fillStyle=r,this.ctx.beginPath(),this.ctx.arc(e,t,a*1.6,0,Math.PI*2),this.ctx.fill();let s=this.ctx.createRadialGradient(e-a*0.1,t-a*0.1,0,e,t,a);s.addColorStop(0,"#FFFEF5"),s.addColorStop(0.15,"#FFF9E6"),s.addColorStop(0.3,"#FFF4D6"),s.addColorStop(0.5,"#FFEDC0"),s.addColorStop(0.7,"#FFE4A8"),s.addColorStop(0.85,"#FFDC95"),s.addColorStop(1,"#FFD37F"),this.ctx.fillStyle=s,this.ctx.beginPath(),this.ctx.arc(e,t,a,0,Math.PI*2),this.ctx.fill()}drawHorizonReflection(e,t,i,a){let n=48+Math.sin(a*0.15)*1.5,o=i*0.85;if(t>=o-50){let r=Math.max(0,(o-t)/50)*0.3;this.ctx.fillStyle=`rgba(255, 140, 0, ${r})`,this.ctx.beginPath(),this.ctx.ellipse(e,o,n*1.5,n*0.5,0,0,Math.PI*2),this.ctx.fill()}}drawNightSky(e,t,i,a){this.ctx.fillStyle="#FFFFFF";for(let r=0;r<20;r++){let s=(e*0.2+r*47)%e,l=(t*0.2+r*23)%(t*0.6),u=Math.sin(i*0.8+r)*0.5+0.5;this.ctx.globalAlpha=u*0.8,this.ctx.beginPath(),this.ctx.arc(s,l,1.5,0,Math.PI*2),this.ctx.fill()}let{x:n,y:o}=a;this.ctx.globalAlpha=0.9,this.ctx.fillStyle="#F0F0F0",this.ctx.beginPath(),this.ctx.arc(n,o,25,0,Math.PI*2),this.ctx.fill(),this.ctx.fillStyle="#1a1a2e",this.ctx.beginPath(),this.ctx.arc(n-8,o-5,22,0,Math.PI*2),this.ctx.fill(),this.ctx.globalAlpha=1}}class xe extends S{constructor(){super(...arguments);this.rainDrops=[];this.lastTime=0}draw(e,t,i,a,n=!1){let o=Date.now()*0.001;this.drawClouds(o,t,i,n?1:0.8),this.drawRain(t,i,n)}drawRain(e,t,i){let a=i?130:90;if(this.rainDrops.length!==a){this.rainDrops=[];for(let s=0;s<a;s++)this.rainDrops.push({x:Math.random()*e,y:Math.random()*t-Math.random()*200,speed:i?80+Math.random()*100:60+Math.random()*80,windOffset:(Math.random()-0.5)*30,width:i?1.2+Math.random()*1:0.8+Math.random()*0.7,length:i?8+Math.random()*10:6+Math.random()*8,alpha:i?0.75+Math.random()*0.15:0.65+Math.random()*0.2,phase:Math.random()*Math.PI*2})}let n=Date.now()*0.001,o=this.lastTime>0?Math.min(n-this.lastTime,0.1):0.016666666666666666;this.lastTime=n;let r=n;for(let s=0;s<this.rainDrops.length;s++){let l=this.rainDrops[s];if(l.y+=l.speed*o,l.y>t+50)l.y=-50-Math.random()*100,l.x=Math.random()*e;let u=l.windOffset*(1+Math.sin(r*0.5+l.phase)*0.2),d=l.x+u;if(d<-10)l.x=e+10;else if(d>e+10)l.x=-10;this.drawRainDrop(d,l.y,l)}}drawRainDrop(e,t,i){this.ctx.save(),this.ctx.globalAlpha=i.alpha;let a=t-i.length*0.5,n=t+i.length*0.5,o=i.alpha,r=i.alpha*0.5;this.ctx.fillStyle="rgba(220, 240, 255, "+o+")",this.ctx.strokeStyle="rgba(240, 250, 255, "+r+")",this.ctx.lineWidth=0.4,this.ctx.beginPath(),this.ctx.moveTo(e,a),this.ctx.quadraticCurveTo(e-i.width*0.3,t,e-i.width,n-i.width*0.3),this.ctx.arc(e,n,i.width,Math.PI,0,!1),this.ctx.quadraticCurveTo(e+i.width*0.3,t,e,a),this.ctx.closePath(),this.ctx.fill(),this.ctx.stroke(),this.ctx.restore()}}class Pt extends S{constructor(){super(...arguments);this.snowflakes=[];this.lastTime=0}draw(e,t,i,a){let n=Date.now()*0.001;this.drawClouds(n,t,i,0.7),this.drawSnowflakes(t,i)}drawSnowflakes(e,t){let i=Math.floor(e*t/5000),a=Math.max(30,Math.min(i,80));if(this.snowflakes.length!==a){this.snowflakes=[];for(let s=0;s<a;s++)this.snowflakes.push({x:Math.random()*e,y:Math.random()*t-Math.random()*100,speedY:15+Math.random()*10,speedX:(Math.random()-0.5)*8,size:1.5+Math.random()*1.5,alpha:0.6+Math.random()*0.3,rotation:Math.random()*Math.PI*2,rotationSpeed:(Math.random()-0.5)*0.3,swayPhase:Math.random()*Math.PI*2,swaySpeed:0.5+Math.random()*0.5})}let n=Date.now()*0.001,o=this.lastTime>0?Math.min(n-this.lastTime,0.1):0.016666666666666666;this.lastTime=n;let r=n;this.ctx.lineCap="round";for(let s=0;s<this.snowflakes.length;s++){let l=this.snowflakes[s],u=Math.sin(r*l.swaySpeed+l.swayPhase)*2;if(l.y+=l.speedY*o,l.x+=(l.speedX+u)*o,l.rotation+=l.rotationSpeed*o,l.y>t+20)l.y=-20-Math.random()*50,l.x=Math.random()*e;if(l.x<-10)l.x=e+10;else if(l.x>e+10)l.x=-10;this.drawSnowflake(l.x,l.y,l.size,l.alpha,l.rotation)}}drawSnowflake(e,t,i,a,n){this.ctx.save(),this.ctx.translate(e,t),this.ctx.rotate(n),this.ctx.strokeStyle=`rgba(255, 255, 255, ${a})`,this.ctx.lineWidth=1,this.ctx.beginPath();for(let o=0;o<6;o++){let r=Math.PI/3*o,s=Math.cos(r),l=Math.sin(r);this.ctx.moveTo(0,0),this.ctx.lineTo(l*i*2.5,s*i*2.5);let u=l*i*1.5+s*i*0.5,d=s*i*1.5-l*i*0.5,h=l*i*1.8+s*i*1.2,p=s*i*1.8-l*i*1.2;this.ctx.moveTo(u,d),this.ctx.lineTo(h,p);let c=l*i*1.5-s*i*0.5,y=s*i*1.5+l*i*0.5,w=l*i*1.8-s*i*1.2,x=s*i*1.8+l*i*1.2;this.ctx.moveTo(c,y),this.ctx.lineTo(w,x)}this.ctx.stroke(),this.ctx.restore()}}class Dt extends S{draw(e,t,i,a){let n=Date.now()*0.0003;this.ctx.fillStyle="rgba(200, 200, 200, 0.4)";for(let o=0;o<3;o++){let r=i*(0.4+o*0.2),s=Math.sin(n+o)*20;this.ctx.beginPath(),this.ctx.moveTo(0,r);for(let l=0;l<=t;l+=5){let u=Math.sin((l/t+n)*Math.PI*4+o)*15;this.ctx.lineTo(l,r+u+s)}this.ctx.lineTo(t,i),this.ctx.lineTo(0,i),this.ctx.closePath(),this.ctx.fill()}}}class $t extends S{constructor(){super(...arguments);this.hailStones=[]}draw(e,t,i,a){let n=Date.now()*0.001;this.drawClouds(n,t,i,1),this.drawHailStones(t,i)}drawHailStones(e,t){if(this.hailStones.length!==60){this.hailStones=[];for(let n=0;n<60;n++)this.hailStones.push({startX:Math.random()*e,startY:Math.random()*(t+150)-75,speed:120+Math.random()*80,windOffset:(Math.random()-0.5)*20,size:2+Math.random()*3,alpha:0.8+Math.random()*0.15,phase:Math.random()*Math.PI*2})}let a=Date.now()*0.002;this.ctx.fillStyle="rgba(240, 250, 255, 1)",this.ctx.strokeStyle="rgba(255, 255, 255, 0.9)",this.ctx.lineWidth=0.5;for(let n=0;n<this.hailStones.length;n++){let o=this.hailStones[n],r=(o.startY+a*o.speed)%(t+150);if(r>t+30)o.startY=-30-Math.random()*30,o.startX=Math.random()*e;let s=o.windOffset*(1+Math.sin(a*0.6+o.phase)*0.15),l=(o.startX+s+a*20%e)%e;if(l<-5)o.startX=e+5;else if(l>e+5)o.startX=-5;this.drawHailStone(l,r,o)}}drawHailStone(e,t,i){this.ctx.save(),this.ctx.globalAlpha=i.alpha,this.ctx.beginPath(),this.ctx.ellipse(e,t,i.size,i.size*0.9,0,0,Math.PI*2),this.ctx.fill(),this.ctx.stroke(),this.ctx.fillStyle="rgba(255, 255, 255, 0.6)",this.ctx.beginPath(),this.ctx.ellipse(e-i.size*0.3,t-i.size*0.3,i.size*0.3,i.size*0.25,0,0,Math.PI*2),this.ctx.fill(),this.ctx.fillStyle="rgba(240, 250, 255, 1)",this.ctx.restore()}}var Ge=0.4;class Ft extends S{constructor(e){super(e);this.bolts=[];this.flashActive=!1;this.rainyAnimation=new xe(e)}draw(e,t,i,a,n=!0){let o=Date.now()*0.001,r=this.getFlashIntensity(o);if(this.updateBolts(o,r,t,i),this.drawBolts(o),this.drawClouds(o,t,i,1),n)this.rainyAnimation.draw(e,t,i,a,!1);this.drawLightning(t,i,r)}getFlashIntensity(e){return Math.max(0,Math.sin(e*2.5)*Math.sin(e*5.3)*Math.sin(e*7.1))}updateBolts(e,t,i,a){this.bolts=this.bolts.filter((o)=>e<o.startsAt+o.duration);let n=t>Ge;if(n&&!this.flashActive){if(this.bolts.push(this.createBolt(e,i,a)),Math.random()<0.3)this.bolts.push(this.createBolt(e+0.08+Math.random()*0.1,i,a))}this.flashActive=n}createBolt(e,t,i){let a=t*(0.1+Math.random()*0.8),n=i*0.25,o=i*(0.6+Math.random()*0.3),r=8+Math.floor(Math.random()*5),s=(o-n)/r,l=Math.min(30,t*0.06),u=[{x:a,y:n}],d=[];for(let h=1;h<=r;h++){let c={x:u[h-1].x+(Math.random()-0.5)*l*2,y:n+s*h};if(u.push(c),h<r-1&&Math.random()<0.25){let y=Math.random()<0.5?-1:1,w=[c],x=2+Math.floor(Math.random()*3);for(let T=1;T<=x;T++){let P=w[T-1];w.push({x:P.x+y*l*(0.3+Math.random()*0.5),y:P.y+s*(0.5+Math.random()*0.5)})}d.push(w)}}return{trunk:u,branches:d,startsAt:e,duration:0.2+Math.random()*0.15}}drawBolts(e){this.bolts.forEach((t)=>{let i=e-t.startsAt;if(i<0)return;let a=0.75+Math.random()*0.25,n=Math.max(0,1-i/t.duration)*a;this.ctx.save(),this.ctx.lineCap="round",this.ctx.lineJoin="round",this.ctx.globalAlpha=n,this.ctx.shadowColor="rgba(200, 220, 255, 1)",t.branches.forEach((o)=>this.strokePath(o,1.2,8)),this.strokePath(t.trunk,2.5,16),this.ctx.restore()})}strokePath(e,t,i){this.ctx.beginPath(),this.ctx.moveTo(e[0].x,e[0].y);for(let a=1;a<e.length;a++)this.ctx.lineTo(e[a].x,e[a].y);this.ctx.strokeStyle="rgba(255, 255, 255, 1)",this.ctx.lineWidth=t,this.ctx.shadowBlur=i,this.ctx.stroke()}drawLightning(e,t,i){if(i>Ge){let a=(i-Ge)/(1-Ge),n=a*0.6,o=Math.min(n,Math.sin(a*Math.PI)*0.6);this.ctx.fillStyle=`rgba(255, 255, 255, ${o})`,this.ctx.fillRect(0,0,e,t)}}}class Et{constructor(e){this.sunny=new zt(e),this.rainy=new xe(e),this.snowy=new Pt(e),this.cloudy=new ke(e),this.foggy=new Dt(e),this.hail=new $t(e),this.thunderstorm=new Ft(e)}draw(e,t,i,a,n){let o=Date.now();switch(e){case"sunny":case"clear":this.sunny.draw(o,t,i,a,n);break;case"clear-night":this.sunny.draw(o,t,i,{type:"night",progress:0},n);break;case"rainy":case"rain":this.rainy.draw(o,t,i,a,!1);break;case"pouring":this.rainy.draw(o,t,i,a,!0);break;case"snowy":case"snow":this.snowy.draw(o,t,i,a);break;case"snowy-rainy":this.rainy.draw(o,t,i,a,!1),this.snowy.draw(o,t,i,a);break;case"hail":this.hail.draw(o,t,i,a);break;case"foggy":case"fog":this.foggy.draw(o,t,i,a);break;case"lightning":this.thunderstorm.draw(o,t,i,a,!1);break;case"lightning-rainy":this.thunderstorm.draw(o,t,i,a,!0);break;case"cloudy":case"partlycloudy":default:this.cloudy.draw(o,t,i,a);break}}}var pn={rainy:0.6,rain:0.6,pouring:1,"lightning-rainy":0.85,"snowy-rainy":0.4},_n=new Set(["sunny","clear","clear-night","partlycloudy","cloudy","windy","windy-variant"]),Zi=8;class Rt{constructor(e){this.canvas=null;this.ctx=null;this.animationFrame=null;this.animations={};this.cloudField=new Ct;this.glassDrops=new Tt;this.wind=new At;this.classic=null;this.resizeObserver=null;this.intersectionObserver=null;this.onScreen=!0;this.qualityName="high";this.quality=Ue("high");this.lastFrameTime=-1/0;this.reducedMotion=typeof window<"u"&&typeof window.matchMedia==="function"?window.matchMedia("(prefers-reduced-motion: reduce)"):null;this.stillKey="";this.width=0;this.height=0;this.container=null;this.handleVisibilityChange=()=>{this.updateRunning()};this.handleMotionChange=()=>{this.stillKey=""};this.getDrawParams=e}setup(e){if(this.container=e,this.setupCanvas(),this.canvas&&this.ctx)this.initializeAnimations(),this.startAnimation(),this.setupResizeObserver(),this.setupIntersectionObserver(),document.addEventListener("visibilitychange",this.handleVisibilityChange),this.reducedMotion?.addEventListener?.("change",this.handleMotionChange)}destroy(){if(document.removeEventListener("visibilitychange",this.handleVisibilityChange),this.reducedMotion?.removeEventListener?.("change",this.handleMotionChange),this.stopAnimation(),this.resizeObserver)this.resizeObserver.disconnect(),this.resizeObserver=null;this.intersectionObserver?.disconnect(),this.intersectionObserver=null,this.canvas=null,this.ctx=null,this.container=null}resize(){if(this.canvas&&this.ctx)this.resizeCanvas()}setupCanvas(){if(!this.container)return;let e=this.container.querySelector("canvas");if(e)e.remove();this.canvas=document.createElement("canvas"),this.container.appendChild(this.canvas),this.resizeCanvas()}resizeCanvas(){if(!this.canvas||!this.container)return;let e=this.container.getBoundingClientRect();if(e.width===0||e.height===0)return;let t=Math.min(window.devicePixelRatio||2,this.quality.maxDpr);if(this.canvas.width=e.width*t,this.canvas.height=e.height*t,this.canvas.style.width="100%",this.canvas.style.height="100%",this.ctx=this.canvas.getContext("2d"),this.ctx)this.ctx.scale(t,t);this.width=e.width,this.height=e.height,this.stillKey="",this.initializeAnimations()}setupResizeObserver(){if(!this.container)return;this.resizeObserver=new ResizeObserver(()=>{this.resizeCanvas()}),this.resizeObserver.observe(this.container)}setupIntersectionObserver(){if(!this.container||typeof IntersectionObserver>"u")return;this.intersectionObserver=new IntersectionObserver((e)=>{this.onScreen=e.some((t)=>t.isIntersecting),this.updateRunning()}),this.intersectionObserver.observe(this.container)}updateRunning(){if(document.hidden||!this.onScreen)this.stopAnimation();else this.startAnimation()}applyQuality(e){if(e===this.qualityName||!We[e])return;let t=this.quality.maxDpr;if(this.qualityName=e,Object.assign(this.quality,We[e]),this.quality.maxDpr!==t)this.resizeCanvas()}initializeAnimations(){if(!this.ctx)return;this.animations={sunny:new yt(this.ctx),rainy:new ie(this.ctx),snowy:new vt(this.ctx),cloudy:new ke(this.ctx),foggy:new kt(this.ctx),hail:new bt(this.ctx),thunderstorm:new xt(this.ctx)},this.classic=null,Object.values(this.animations).forEach((e)=>{e.attach(this.cloudField,this.quality)})}startAnimation(){if(this.animationFrame)return;let e=(t=0)=>{let i=this.reducedMotion?.matches===!0;if(t-this.lastFrameTime>=(i?500:1000/this.quality.fps-2))this.lastFrameTime=t,this.draw(i);this.animationFrame=requestAnimationFrame(e)};e()}stopAnimation(){if(this.animationFrame)cancelAnimationFrame(this.animationFrame),this.animationFrame=null}draw(e=!1){if(!this.ctx||!this.canvas)return;if(!this.width||!this.height){if(this.resizeCanvas(),!this.width||!this.height)return}let t=this.getDrawParams();if(!t)return;this.applyQuality(t.quality??"high");let{condition:i,timeOfDay:a,sunPosition:n,moonPhase:o,visualStyle:r}=t,s=this.width,l=this.height;if(e){let w=JSON.stringify([i,a.type,Math.round(a.progress*20),n,o,r,t.quality,t.aurora,t.raindrops,t.windEffects,Math.round(t.windSpeed??0),s,l]);if(w===this.stillKey)return;this.stillKey=w}else this.stillKey="";this.ctx.clearRect(0,0,s,l);let u=i.toLowerCase();if(r==="classic"){this.classic??=new Et(this.ctx),this.classic.draw(u,s,l,a,n);return}let d=u==="windy"||u==="windy-variant",h=Math.max(0,t.windSpeed??0);if(this.cloudField.setWeather(u,a),this.cloudField.setWind(Math.min(4,Math.max(d?2.5:1,1+h/5))),e)this.cloudField.settle();switch(u){case"sunny":case"clear":case"partlycloudy":case"windy":this.animations.sunny?.draw(Date.now(),s,l,a,n,o,t.aurora);break;case"clear-night":this.animations.sunny?.draw(Date.now(),s,l,{type:"night",progress:0},n,o,t.aurora);break;case"rainy":case"rain":this.animations.rainy?.draw(Date.now(),s,l,a,!1);break;case"pouring":this.animations.rainy?.draw(Date.now(),s,l,a,!0);break;case"snowy":case"snow":this.animations.snowy?.draw(Date.now(),s,l,a);break;case"snowy-rainy":this.animations.rainy?.draw(Date.now(),s,l,a,!1),this.animations.snowy?.drawSnowflakes(s,l);break;case"hail":this.animations.hail?.draw(Date.now(),s,l,a);break;case"foggy":case"fog":this.animations.foggy?.draw(Date.now(),s,l,a);break;case"lightning":this.animations.thunderstorm?.draw(Date.now(),s,l,a,!1);break;case"lightning-rainy":this.animations.thunderstorm?.draw(Date.now(),s,l,a,!0);break;case"cloudy":default:this.animations.cloudy?.draw(Date.now(),s,l,a);break}let p=Date.now()*0.001,c=d?Math.max(0.6,(h-Zi)/10):(h-Zi)/10;if(t.windEffects!==!1&&_n.has(u)&&c>0){let w=q(u,a).daylight;this.wind.draw(this.ctx,p,s,l,Math.min(1,c),d,w,this.quality)}let y=pn[u];if(y&&t.raindrops!==!1&&this.quality.details)this.glassDrops.draw(this.ctx,p,s,l,y,this.quality)}}var Se=(e)=>{let t=typeof e==="string"?parseFloat(e):e;return typeof t==="number"&&Number.isFinite(t)?t:null};function Xi(e){let t=[],i=[],a=0,n=0,o=0;for(let s of e){let l=Se(s.wind_speed),u=Se(s.wind_gust_speed),d=Se(s.wind_bearing);if(l!==null)t.push(l);if(u!==null)i.push(u);if(d!==null){let h=l!==null&&l>0?l:1;a+=Math.sin(d*Math.PI/180)*h,n+=Math.cos(d*Math.PI/180)*h,o++}}let r={};if(t.length>0)r.wind_speed=Math.max(...t);if(i.length>0)r.wind_gust_speed=Math.max(...i);if(o>0&&(Math.abs(a)>0.000000001||Math.abs(n)>0.000000001))r.wind_bearing=Math.round((Math.atan2(a,n)*180/Math.PI+360)%360);return r}function ea(e,t,i){let a=(r)=>{let s=Se(r);return s===null?null:Math.round(W(s,t,i))},n=a(e.wind_speed);if(n===null)return null;let o=a(e.wind_gust_speed);return{speed:n,gust:o!==null&&o>n?o:null,bearing:Se(e.wind_bearing)}}var Me=3600000;function mn(e,t=new Date){for(let i of e){let a=i.map((s)=>({text:s.detailed_description?.trim()??"",time:new Date(s.datetime).getTime()})).filter(({time:s})=>!Number.isNaN(s)).sort((s,l)=>s.time-l.time);if(!a.some(({text:s})=>s))continue;let n=a.filter(({time:s})=>s<=t.getTime()),o=n[n.length-1];if(o?.text)return o.text;let r=a.find(({time:s,text:l})=>s>t.getTime()&&l);if(r)return r.text}return null}function gn(e,t){if(t<=1||e.length===0)return e.map(({item:o})=>o);let i=e.findIndex(({time:o})=>new Date(o).getHours()%t===0),a=i!==-1&&e[i].time<e[0].time+t*Me?i:0,n=[];for(let o=a;o<e.length;o++)if(n.length===0||e[o].time>=e[n[n.length-1]].time+t*Me-60000)n.push(o);return n.map((o,r)=>{let s=r+1<n.length?n[r+1]:Math.min(e.length,o+t),l=e.slice(o,s).map(({item:d})=>d.precipitation_probability).filter((d)=>d!=null),u=e[o].item;return l.length>1?{...u,precipitation_probability:Math.max(...l)}:u})}class jt{constructor(e){this.hourlyForecast=[];this.dailyForecast=[];this.twiceDailyForecast=[];this.subscriptions=[];this.onUpdate=e}getHourlyData(){return this.hourlyForecast}getDailyData(){return this.dailyForecast}async subscribe(e,t,i){if(!e||!t)return;await this.unsubscribe(),this.hourlyForecast=[],this.dailyForecast=[],this.twiceDailyForecast=[];let a=["hourly"];if(i.daily)a.push("daily");if(i.twiceDaily)a.push("twice_daily");for(let n of a)try{let o=e.connection.subscribeMessage((r)=>{if(r.forecast&&r.forecast.length>0){if(n==="hourly")this.hourlyForecast=r.forecast;else if(n==="daily")this.dailyForecast=r.forecast;else this.twiceDailyForecast=r.forecast;this.onUpdate()}},{type:"weather/subscribe_forecast",forecast_type:n,entity_id:t});o.catch(()=>{}),this.subscriptions.push(o)}catch{}}async unsubscribe(){let e=this.subscriptions;this.subscriptions=[];for(let t of e)try{(await t)()}catch{}}getForecastDescription(e,t=new Date){return mn([this.twiceDailyForecast,this.dailyForecast,this.hourlyForecast,e?.forecast??[]],t)}getHourlyForecast(e,t,i=1){let a=Math.max(1,Math.floor(Number(e??m.hourlyForecastHours))||m.hourlyForecastHours),n=this.hourlyForecast&&this.hourlyForecast.length>0,o=n?this.hourlyForecast:t?.forecast??[],r=Date.now(),s=o.map((h)=>({item:h,time:new Date(h.datetime).getTime()})).filter(({time:h})=>!Number.isNaN(h)).sort((h,p)=>h.time-p.time).filter(({time:h})=>h>r-Me),l=s.length<2||s[1].time-s[0].time<=3*Me,u=n||l?s:s.filter(({time:h})=>h<r+24*Me),d=Math.max(1,Math.floor(Number(i))||1);return gn(u,d).slice(0,a)}getDailyForecast(e,t){let i=Math.max(1,Math.floor(Number(e??m.dailyForecastDays)));if(this.dailyForecast&&this.dailyForecast.length>0)return this.dailyForecast.slice(0,i);if(!t?.forecast||t.forecast.length===0)return[];let a=new Date,n=new Date(a.getFullYear(),a.getMonth(),a.getDate()),o=new Date(n);o.setDate(o.getDate()+i);let r=(l)=>{let u=l.getFullYear(),d=String(l.getMonth()+1).padStart(2,"0"),h=String(l.getDate()).padStart(2,"0");return`${u}-${d}-${h}`},s=new Map;return t.forecast.forEach((l)=>{if(!l.datetime)return;let u=new Date(l.datetime);if(Number.isNaN(u.getTime()))return;if(u<n||u>=o)return;let d=r(u),h=Math.abs(u.getHours()+u.getMinutes()/60-12),p=l.temperature??l.temp??l.native_temperature,c=s.get(d)??{item:l,itemDate:u,hourScore:h,temperatures:[],precipitationProbabilities:[],entries:[]};if(h<c.hourScore)c.item=l,c.itemDate=u,c.hourScore=h;if(p!=null)c.temperatures.push(p);if(l.precipitation_probability!=null)c.precipitationProbabilities.push(l.precipitation_probability);c.entries.push(l),s.set(d,c)}),Array.from(s.values()).sort((l,u)=>l.itemDate.getTime()-u.itemDate.getTime()).map(({item:l,temperatures:u,precipitationProbabilities:d,entries:h})=>{if(u.length<2)return l;let p={...l,temperature:Math.max(...u),templow:l.templow??l.native_templow??Math.min(...u),...Xi(h)};if(d.length>0)p.precipitation_probability=Math.max(...d);return p}).slice(0,i)}}class Nt{constructor(e,t,i){this.holdTimer=null;this.lastTap=null;this.holdFired=!1;this.holdDelay=500;this.getHass=e,this.getConfig=t,this.fireEvent=i}handleTap(e){if(e.target.closest(".forecast-item")||e.target.closest(".info-item"))return;if(this.lastTap&&Date.now()-this.lastTap<300){this.handleDoubleTap(),this.lastTap=null;return}this.lastTap=Date.now(),setTimeout(()=>{if(this.lastTap)this.handleAction(this.getConfig().tapAction),this.lastTap=null},300)}handlePointerDown(){this.holdTimer=window.setTimeout(()=>{this.handleHold(),this.holdFired=!0},this.holdDelay)}handlePointerUp(e){if(this.holdTimer)clearTimeout(this.holdTimer);if(this.holdFired)e.preventDefault(),e.stopPropagation(),this.holdFired=!1}handleHold(){this.handleAction(this.getConfig().holdAction)}handleDoubleTap(){this.handleAction(this.getConfig().doubleTapAction)}handleAction(e){let t=this.getHass(),i=this.getConfig();if(!e||!t)return;switch(e.action||"more-info"){case"more-info":this.fireEvent("hass-more-info",{entityId:e.entity||i.entity});break;case"toggle":t.callService("homeassistant","toggle",{entity_id:e.entity||i.entity});break;case"call-service":if(e.service){let[n,o]=e.service.split(".");t.callService(n,o,e.service_data||{})}break;case"navigate":if(e.navigation_path)window.history.pushState(null,"",e.navigation_path),this.fireEvent("location-changed",{replace:!1});break;case"url":if(e.url_path)window.open(e.url_path);break;case"none":default:break}}}function N(e,t){if(!e||!t)return null;let i=e.states[t];if(!i)return null;let a=parseFloat(i.state);if(!Number.isFinite(a))return null;let n=i.attributes?.unit_of_measurement;return{value:a,unit:typeof n==="string"?n:null}}function fn(e,t){if(!e||!t)return null;let i=e.states[t];return i?i.state:null}function V(e,t){if(!e||!t)return{};let i=e.states[t];return i?i.attributes:{}}function It(e,t,i,a){let n=fn(e,t),o=V(e,t),r=o.condition||n||"sunny",s=null;if(i.templowAttribute&&o[i.templowAttribute]!=null)s=o[i.templowAttribute];else{for(let Bt of di)if(o[Bt]!=null){s=o[Bt];break}if(s==null)s=(o.forecast&&o.forecast[0]?o.forecast[0].templow??null:null)||(o.forecast_hourly&&o.forecast_hourly[0]?o.forecast_hourly[0].native_templow??null:null)}let l=i.sensorEntities||{},u=N(e,l.temperature),d=N(e,l.feelsLike),h=N(e,l.humidity),p=N(e,l.windSpeed),c=N(e,l.windGust),y=N(e,l.windBearing),w=N(e,l.precipitation),x=N(e,l.pressure),T=N(e,l.uvIndex),P=N(e,l.dewPoint),ue=N(e,l.aqi),Q=typeof o.wind_speed_unit==="string"?o.wind_speed_unit:"m/s",de=o.wind_gust_speed||o.wind_gust||null,J=p?.unit??(p?Q:c?.unit??null),C=J??Q,ga=p?p.value:J&&o.wind_speed!=null?W(o.wind_speed,Q,C):o.wind_speed??null,fa=c?W(c.value,c.unit??C,C):de!=null&&J?W(de,Q,C):de;return{condition:r,temperature:u?.value??(o.temperature!=null?o.temperature:null),apparentTemperature:d?.value??(o.apparent_temperature||null),humidity:h?Math.round(h.value):o.humidity!=null?o.humidity:null,windSpeed:ga,windGust:fa,windBearing:y?.value??(o.wind_bearing!=null?o.wind_bearing:null),windDirection:o.wind_direction||null,pressure:x?.value??(o.pressure!=null?o.pressure:null),pressureUnit:x?x.unit:typeof o.pressure_unit==="string"?o.pressure_unit:null,uvIndex:T?.value??(o.uv_index!=null?o.uv_index:null),dewPoint:P?.value??(o.dew_point!=null?o.dew_point:null),aqi:ue?.value??null,forecast:o.forecast||o.forecast_hourly||a||[],friendlyName:o.friendly_name||g.t("weather"),templow:s,windSpeedUnit:J,precipitation:w?.value??null,precipitationUnit:w?.unit??null}}function ia(e){switch((e||"").toLowerCase()){case"rainy":case"rain":case"pouring":return"rain";case"snowy":case"snow":return"snow";case"snowy-rainy":return"sleet";case"hail":return"hail";case"lightning":case"lightning-rainy":return"storm";default:return null}}function ta(e){let t=ia(e.condition);if(t)return t;return(e.precipitation_probability??0)>=50?"rain":null}function yn(e,t,i){let a=e.map((r)=>({time:new Date(r.datetime),entry:r})).filter(({time:r})=>!Number.isNaN(r.getTime())).sort((r,s)=>r.time.getTime()-s.time.getTime());if(a.length<2||a[1].time.getTime()-a[0].time.getTime()>10800000)return[];let n=t.getTime()-3600000,o=t.getTime()+i*3600000;return a.filter(({time:r})=>r.getTime()>n&&r.getTime()<=o)}function aa(e,t,i=new Date,a=12){let n=yn(t,i,a);if(n.length===0)return null;let o=ia(e);if(o){let r=n.find(({time:s,entry:l})=>s.getTime()>i.getTime()&&!ta(l));return r?{kind:o,type:"stop",time:r.time,hours:a}:{kind:o,type:"continues",time:null,hours:a}}for(let{time:r,entry:s}of n){let l=ta(s);if(!l)continue;return{kind:l,type:"start",time:r.getTime()>i.getTime()?r:null,hours:a}}return null}var wn={wind:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-dasharray="35 22" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M43.64 20a5 5 0 113.61 8.46h-35.5">
        <animate attributeName="stroke-dashoffset" dur="2s" repeatCount="indefinite" values="-57; 57"/>
      </path>
      <path fill="none" stroke="currentColor" stroke-dasharray="24 15" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M29.14 44a5 5 0 103.61-8.46h-21">
        <animate attributeName="stroke-dashoffset" begin="-1.5s" dur="2s" repeatCount="indefinite" values="-39; 39"/>
      </path>
    </svg>
  `,humidity:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M32 17c-6.09 9-10 14.62-10 20.09a10 10 0 0020 0C42 31.62 38.09 26 32 17z"/>
      <path fill="currentColor" opacity="0.8" d="M26.24 30.19a3 3 0 012.12-.69 3 3 0 012.12.69 2.51 2.51 0 01.74 1.92v1.24a2.48 2.48 0 01-.74 1.9 3.05 3.05 0 01-2.12.68 3 3 0 01-2.12-.68 2.48 2.48 0 01-.74-1.9v-1.24a2.51 2.51 0 01.74-1.92zm11-.23a.42.42 0 01-.08.4L29 41.69a1.37 1.37 0 01-.44.44 1.87 1.87 0 01-.72.09h-.67c-.2 0-.33-.06-.38-.18s0-.25.09-.42l8.2-11.35a1 1 0 01.41-.41 2 2 0 01.67-.08h.76q.27 0 .34.22zm-8.9 1.17c-.79 0-1.19.36-1.19 1.07v1c0 .71.4 1.07 1.19 1.07s1.19-.36 1.19-1.07v-1c.02-.71-.38-1.07-1.17-1.07zm5.16 5.63a3 3 0 012.12-.69 3 3 0 012.12.69 2.51 2.51 0 01.74 1.92v1.24a2.48 2.48 0 01-.74 1.9 3 3 0 01-2.12.68 3.05 3.05 0 01-2.12-.68 2.48 2.48 0 01-.74-1.9v-1.24a2.51 2.51 0 01.76-1.92zm2.12.94c-.79 0-1.19.35-1.19 1.07v1c0 .73.4 1.09 1.19 1.09s1.19-.36 1.19-1.09v-1c.02-.72-.38-1.07-1.17-1.07z"/>
    </svg>
  `,precipitation:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="3" d="M46.5 33.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 47.5h28.5a7 7 0 000-14z" transform="translate(0 -8)"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M24 46l-3 9m11-9l-3 9m11-9l-3 9"/>
    </svg>
  `,sunrise:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14 25l-6.34 6.34M14 16v2m18 12a10 10 0 00-10 10m24 0a10 10 0 00-10-10m22 16H6m50.34-16L50 23.66"/>
      <circle cx="32" cy="40" r="5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/>
      <path fill="none" stroke="currentColor" stroke-dasharray="2 3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M46 40a14 14 0 00-28 0"/>
    </svg>
  `,sunset:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14 41l-6.34-6.34M14 50v-2m18-12a10 10 0 0110 10m-24 0a10 10 0 0110-10M6 52h52M7.66 42L14 48.34"/>
      <circle cx="32" cy="46" r="5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/>
      <path fill="none" stroke="currentColor" stroke-dasharray="2 3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M46 46a14 14 0 01-28 0"/>
    </svg>
  `,pressure:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M14.5 44a19 19 0 1135 0"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M32 38l9-10"/>
      <circle cx="32" cy="38" r="3" fill="currentColor"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M19 33.5l2.5 1M32 22.5V25m13 8.5l-2.5 1"/>
    </svg>
  `,uv:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <circle cx="32" cy="32" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M32 12v5m0 30v5M12 32h5m30 0h5M17.9 17.9l3.5 3.5m21.2 21.2l3.5 3.5M17.9 46.1l3.5-3.5m21.2-21.2l3.5-3.5"/>
    </svg>
  `,dewPoint:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M24 38.5V16a5 5 0 0110 0v22.5a8.5 8.5 0 11-10 0z"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M29 26v17"/>
      <path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="3" d="M46 24c-3 4.4-5 7.2-5 9.9a5 5 0 0010 0c0-2.7-2-5.5-5-9.9z"/>
    </svg>
  `,aqi:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M17 47c0-19 12-29 31-30 0 20-10 30-26 30"/>
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M17 47c6-9 13-16 22-21"/>
    </svg>
  `},Ke=(e)=>b`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" style="transform: rotate(${e}deg); transform-origin: center;">
    <path fill="currentColor" d="M12 2L4 20L12 17L20 20L12 2Z"/>
  </svg>
`,vn={sunny:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#f59e0b" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M42.5 32A10.5 10.5 0 1132 21.5 10.5 10.5 0 0142.5 32zM32 15.71V9.5m0 45v-6.21m11.52-27.81l4.39-4.39M16.09 47.91l4.39-4.39m0-23l-4.39-4.39m31.82 31.78l-4.39-4.39M15.71 32H9.5m45 0h-6.21"/>
        <animateTransform attributeName="transform" dur="45s" from="0 32 32" repeatCount="indefinite" to="360 32 32" type="rotate"/>
      </g>
    </svg>
  `,clear:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#f59e0b" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M42.5 32A10.5 10.5 0 1132 21.5 10.5 10.5 0 0142.5 32zM32 15.71V9.5m0 45v-6.21m11.52-27.81l4.39-4.39M16.09 47.91l4.39-4.39m0-23l-4.39-4.39m31.82 31.78l-4.39-4.39M15.71 32H9.5m45 0h-6.21"/>
        <animateTransform attributeName="transform" dur="45s" from="0 32 32" repeatCount="indefinite" to="360 32 32" type="rotate"/>
      </g>
    </svg>
  `,"clear-night":b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#72b9d5" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M46.66 36.2a16.66 16.66 0 01-16.78-16.55 16.29 16.29 0 01.55-4.15A16.56 16.56 0 1048.5 36.1c-.61.06-1.22.1-1.84.1z"/>
        <animateTransform attributeName="transform" dur="10s" repeatCount="indefinite" type="rotate" values="-5 32 32;15 32 32;-5 32 32"/>
      </g>
    </svg>
  `,partlycloudy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <clipPath id="partly-cloudy-clip">
          <path fill="none" d="M12 35l-5.28-4.21-2-6 1-7 4-5 5-3h6l5 1 3 3L33 20l-6 4h-6l-3 3v4l-4 2-2 2z"/>
        </clipPath>
      </defs>
      <g clip-path="url(#partly-cloudy-clip)">
        <g>
          <path fill="none" stroke="#f59e0b" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M23.5 24a4.5 4.5 0 11-4.5-4.5 4.49 4.49 0 014.5 4.5zM19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17"/>
          <animateTransform attributeName="transform" dur="45s" from="0 19 24" repeatCount="indefinite" to="360 19 24" type="rotate"/>
        </g>
      </g>
      <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
    </svg>
  `,overcast:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <clipPath id="overcast-clip-a">
          <path fill="none" d="M12 35l-8-1-1-10 2-8 5-4 4.72-2.21h6L29 10l4 3v7l-6 4h-6l-3 3v4l-4 2-2 2z"/>
        </clipPath>
        <clipPath id="overcast-clip-b">
          <path fill="none" d="M41.8 20.25l4.48 6.61.22 4.64 5.31 2.45 1.69 5.97h8.08L61 27l-9.31-8.5-9.89 1.75z"/>
        </clipPath>
      </defs>
      <g clip-path="url(#overcast-clip-a)">
        <g>
          <g>
            <path fill="none" stroke="#f59e0b" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M23.5 24a4.5 4.5 0 11-4.5-4.5 4.49 4.49 0 014.5 4.5zM19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17"/>
            <animateTransform attributeName="transform" dur="45s" from="0 19 24" repeatCount="indefinite" to="360 19 24" type="rotate"/>
          </g>
          <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="3 0; -3 0; 3 0"/>
        </g>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-3 0; 3 0; -3 0"/>
      </g>
      <g clip-path="url(#overcast-clip-b)">
        <path fill="none" stroke="#9ca3af" stroke-linejoin="round" stroke-width="2" d="M34.23 33.45a4.05 4.05 0 004.05 4h16.51a4.34 4.34 0 00.81-8.61 3.52 3.52 0 00.06-.66 4.06 4.06 0 00-6.13-3.48 6.08 6.08 0 00-11.25 3.19 6.34 6.34 0 00.18 1.46h-.18a4.05 4.05 0 00-4.05 4.1z"/>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-2.1 0; 2.1 0; -2.1 0"/>
      </g>
      <g>
        <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-3 0; 3 0; -3 0"/>
      </g>
    </svg>
  `,cloudy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-3 0; 3 0; -3 0"/>
      </g>
    </svg>
  `,rainy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M24.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M31.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M38.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
    </svg>
  `,rain:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M24.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M31.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M38.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
    </svg>
  `,pouring:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M24.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M31.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M38.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
    </svg>
  `,snowy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <circle cx="31" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" dur="4s" repeatCount="indefinite" type="translate" values="-1 -6; 1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 31 45; 360 31 45"/>
        <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
      <g>
        <circle cx="24" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" begin="-2s" dur="4s" repeatCount="indefinite" type="translate" values="1 -6; -1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 24 45; 360 24 45"/>
        <animate attributeName="opacity" begin="-2s" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
      <g>
        <circle cx="38" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" begin="-1s" dur="4s" repeatCount="indefinite" type="translate" values="1 -6; -1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 38 45; 360 38 45"/>
        <animate attributeName="opacity" begin="-1s" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
    </svg>
  `,snow:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <circle cx="31" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" dur="4s" repeatCount="indefinite" type="translate" values="-1 -6; 1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 31 45; 360 31 45"/>
        <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
      <g>
        <circle cx="24" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" begin="-2s" dur="4s" repeatCount="indefinite" type="translate" values="1 -6; -1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 24 45; 360 24 45"/>
        <animate attributeName="opacity" begin="-2s" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
      <g>
        <circle cx="38" cy="45" r="1.25" fill="none" stroke="#72b8d4" stroke-miterlimit="10"/>
        <path fill="none" stroke="#72b8d4" stroke-linecap="round" stroke-miterlimit="10" d="M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63"/>
        <animateTransform additive="sum" attributeName="transform" begin="-1s" dur="4s" repeatCount="indefinite" type="translate" values="1 -6; -1 12"/>
        <animateTransform additive="sum" attributeName="transform" dur="9s" repeatCount="indefinite" type="rotate" values="0 38 45; 360 38 45"/>
        <animate attributeName="opacity" begin="-1s" dur="4s" repeatCount="indefinite" values="0;1;1;1;0"/>
      </g>
    </svg>
  `,foggy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
      <g>
        <path fill="none" stroke="#d1d5db" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M17 58h30"/>
        <animateTransform attributeName="transform" begin="0s" dur="5s" repeatCount="indefinite" type="translate" values="-4 0; 4 0; -4 0"/>
      </g>
      <g>
        <path fill="none" stroke="#d1d5db" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M17 52h30"/>
        <animateTransform attributeName="transform" begin="-4s" dur="5s" repeatCount="indefinite" type="translate" values="-4 0; 4 0; -4 0"/>
      </g>
    </svg>
  `,fog:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
      <g>
        <path fill="none" stroke="#d1d5db" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M17 58h30"/>
        <animateTransform attributeName="transform" begin="0s" dur="5s" repeatCount="indefinite" type="translate" values="-4 0; 4 0; -4 0"/>
      </g>
      <g>
        <path fill="none" stroke="#d1d5db" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3" d="M17 52h30"/>
        <animateTransform attributeName="transform" begin="-4s" dur="5s" repeatCount="indefinite" type="translate" values="-4 0; 4 0; -4 0"/>
      </g>
    </svg>
  `,hail:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <circle cx="24" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
      <g>
        <circle cx="31" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
      <g>
        <circle cx="38" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
    </svg>
  `,"snowy-rainy":b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <circle cx="24" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
      <g>
        <circle cx="31" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
      <g>
        <circle cx="38" cy="45" r="1.5" fill="#72b8d4"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.6s" repeatCount="indefinite" type="translate" values="1 -5; -2 18; -4 14"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.6s" repeatCount="indefinite" values="1;1;0"/>
      </g>
    </svg>
  `,lightning:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M24.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M31.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M38.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="#f59e0b" d="M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z"/>
        <animate attributeName="opacity" dur="2s" repeatCount="indefinite" values="1;1;1;1;1;1;0.1;1;0.1;1;1;0.1;1;0.1;1"/>
      </g>
    </svg>
  `,"lightning-rainy":b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="none" stroke="#e5e7eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M43.67 45.5h2.83a7 7 0 000-14h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0"/>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M24.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M31.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.4s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.4s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="none" stroke="#2885c7" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2" d="M38.39 43.03l-.78 4.94"/>
        <animateTransform attributeName="transform" begin="-0.2s" dur="0.7s" repeatCount="indefinite" type="translate" values="1 -5; -2 10"/>
        <animate attributeName="opacity" begin="-0.2s" dur="0.7s" repeatCount="indefinite" values="0;1;1;0"/>
      </g>
      <g>
        <path fill="#f59e0b" d="M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z"/>
        <animate attributeName="opacity" dur="2s" repeatCount="indefinite" values="1;1;1;1;1;1;0.1;1;0.1;1;1;0.1;1;0.1;1"/>
      </g>
    </svg>
  `,windy:b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-3 0; 3 0; -3 0"/>
      </g>
    </svg>
  `,"windy-variant":b`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g>
        <path fill="none" stroke="#e5e7eb" stroke-linejoin="round" stroke-width="3" d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z"/>
        <animateTransform attributeName="transform" dur="7s" repeatCount="indefinite" type="translate" values="-3 0; 3 0; -3 0"/>
      </g>
    </svg>
  `};function U(e,...t){let i=wn[e];if(typeof i==="function")return i(...t);return i||""}function Ce(e){if(!e)return"";return vn[e.toLowerCase()]||""}class na extends z{constructor(){super(...arguments);this.format=null;this.compact=!1;this.showDate=!1;this.lang="en";this.currentTime="";this.currentDate="";this.clockInterval=null}static styles=H`
    :host {
      display: block;
    }

    :host([hidden]) {
      display: none;
    }

    .clock {
      margin-top: 0;
      margin-bottom: 0;
      font-size: 48px;
      font-weight: 200;
      line-height: 1;
      color: var(--dwc-text-color, white);
      text-align: right;
      text-shadow: var(--card-text-shadow);
      z-index: 2;
      pointer-events: none;
    }

    @media (max-width: 600px) {
      .clock {
        font-size: 36px;
        margin-top: 0;
        margin-bottom: 0;
      }
    }

    .date {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 400;
      line-height: 1.2;
      opacity: 0.85;
      color: var(--dwc-text-color, white);
      text-align: right;
      text-shadow: var(--card-text-shadow);
      white-space: nowrap;
      pointer-events: none;
    }

    :host([compact]) .clock {
      font-size: 32px;
    }

    :host([compact]) .date {
      margin-top: 2px;
      font-size: 14px;
    }
  `;connectedCallback(){super.connectedCallback(),this.restartTimer()}disconnectedCallback(){super.disconnectedCallback(),this.stopTimer()}updated(e){if(super.updated(e),e.has("format")||e.has("showDate")||e.has("lang"))this.restartTimer()}restartTimer(){if(this.stopTimer(),this.format||this.showDate)this.updateTime(),this.clockInterval=window.setInterval(()=>this.updateTime(),1000)}stopTimer(){if(this.clockInterval)clearInterval(this.clockInterval),this.clockInterval=null}updateTime(){let e=new Date;if(this.format)this.currentTime=Li(e,this.format,g.t("am"),g.t("pm"));if(this.showDate)this.currentDate=Hi(e,this.lang)}render(){if(!this.format&&!this.showDate)return _``;return _`
      ${this.format?_`<div class="clock">${this.currentTime}</div>`:""}
      ${this.showDate?_`<div class="date">${this.currentDate}</div>`:""}
    `}}v([k({type:String})],na.prototype,"format",void 0),v([k({type:Boolean,reflect:!0})],na.prototype,"compact",void 0),v([k({type:Boolean})],na.prototype,"showDate",void 0),v([k({type:String})],na.prototype,"lang",void 0),v([fe()],na.prototype,"currentTime",void 0),v([fe()],na.prototype,"currentDate",void 0);customElements.define("weather-clock",na);class oa extends z{constructor(){super(...arguments);this.weather=null;this.sunData=null;this.config=null;this.entityAttributes=null;this.compact=!1}static styles=H`
    :host {
      display: block;
    }

    :host([hidden]) {
      display: none;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 12px;
      font-size: 13px;
      opacity: 0.9;
      text-shadow: var(--card-text-shadow);
    }

    :host([compact]) .info-grid {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px 16px;
      font-size: 14px;
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .info-item span:last-child {
      white-space: nowrap;
    }

    .info-icon {
      font-size: 16px;
      width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--dwc-text-color, white);
      filter: var(--card-icon-filter);
    }

    .info-icon svg {
      width: 20px;
      height: 20px;
      display: block;
    }

    :host([compact]) .sun-group {
      display: flex;
      flex-direction: row;
      gap: 16px;
    }
  `;hasContent(){if(!this.weather||!this.config)return!1;return this.config.showHumidity&&this.weather.humidity!=null||this.config.showWind&&this.weather.windSpeed!=null||this.config.showPressure&&this.weather.pressure!=null||this.config.showUvIndex&&this.weather.uvIndex!=null||this.config.showDewPoint&&this.weather.dewPoint!=null||this.weather.aqi!=null||this.weather.precipitation!=null||this.config.showSunriseSunset&&this.sunData?.hasSunData===!0}renderHumidity(){if(!this.config?.showHumidity||this.weather?.humidity==null)return _``;return _`
      <div class="info-item">
        <span class="info-icon">${U("humidity")}</span>
        <span>${this.weather.humidity} %</span>
      </div>
    `}renderItem(e,t,i){return _`
      <div class="info-item" title="${i}">
        <span class="info-icon">${U(e)}</span>
        <span>${t}</span>
      </div>
    `}renderPressure(){if(!this.config?.showPressure||this.weather?.pressure==null)return _``;let e=this.weather.pressureUnit,t=e==="inHg"?2:e==="kPa"?1:0;return this.renderItem("pressure",`${this.weather.pressure.toFixed(t)}${e?` ${e}`:""}`,g.t("pressure"))}renderUvIndex(){if(!this.config?.showUvIndex||this.weather?.uvIndex==null)return _``;return this.renderItem("uv",`UV ${Math.round(this.weather.uvIndex)}`,g.t("uv_index"))}renderDewPoint(){if(!this.config?.showDewPoint||this.weather?.dewPoint==null)return _``;return this.renderItem("dewPoint",`${Math.round(this.weather.dewPoint)}°`,g.t("dew_point"))}renderAqi(){if(this.weather?.aqi==null)return _``;return this.renderItem("aqi",`AQI ${Math.round(this.weather.aqi)}`,g.t("aqi"))}renderSunrise(){if(!this.config?.showSunriseSunset||!this.sunData?.hasSunData||!this.sunData.sunrise)return _``;return _`
      <div class="info-item">
        <span class="info-icon">${U("sunrise")}</span>
        <span>${we(this.sunData.sunrise,this.config.clockFormat,g.t("am"),g.t("pm"))}</span>
      </div>
    `}renderWind(){if(!this.config?.showWind||this.weather?.windSpeed==null)return _``;let e=this.weather.windSpeedUnit?{...this.entityAttributes||{},wind_speed_unit:this.weather.windSpeedUnit}:this.entityAttributes||{},t=pt(this.weather.windSpeed,e,this.config.windSpeedUnit),i=Ii(e,this.config.windSpeedUnit,g.t.bind(g)),a="";if(this.config.showWindGust&&this.weather.windGust)a=` / ${pt(this.weather.windGust,e,this.config.windSpeedUnit)} ${i}`;let n=this.config.showWindDirection&&this.weather.windBearing!=null?Ke(this.weather.windBearing):U("wind");return _`
      <div class="info-item">
        <span class="info-icon">${n}</span>
        <span>${t} ${i}${a}</span>
      </div>
    `}renderPrecipitation(){if(this.weather?.precipitation==null)return _``;let e=Math.round(this.weather.precipitation*10)/10,t=this.weather.precipitationUnit?` ${this.weather.precipitationUnit}`:"";return _`
      <div class="info-item">
        <span class="info-icon">${U("precipitation")}</span>
        <span>${e}${t}</span>
      </div>
    `}renderSunset(){if(!this.config?.showSunriseSunset||!this.sunData?.hasSunData||!this.sunData.sunset)return _``;return _`
      <div class="info-item">
        <span class="info-icon">${U("sunset")}</span>
        <span>${we(this.sunData.sunset,this.config.clockFormat,g.t("am"),g.t("pm"))}</span>
      </div>
    `}render(){if(!this.hasContent())return _``;let t=this.config?.showSunriseSunset&&this.sunData?.hasSunData?_`
      <div class="sun-group">
        ${this.renderSunrise()}
        ${this.renderSunset()}
      </div>
    `:_``;return _`
      <div class="info-grid">
        ${this.renderHumidity()}
        ${this.renderWind()}
        ${this.compact?t:_`${this.renderSunrise()}${this.renderSunset()}`}
        ${this.renderPrecipitation()}
        ${this.renderPressure()}
        ${this.renderUvIndex()}
        ${this.renderDewPoint()}
        ${this.renderAqi()}
      </div>
    `}}v([k({type:Object})],oa.prototype,"weather",void 0),v([k({type:Object})],oa.prototype,"sunData",void 0),v([k({type:Object})],oa.prototype,"config",void 0),v([k({type:Object})],oa.prototype,"entityAttributes",void 0),v([k({type:Boolean,reflect:!0})],oa.prototype,"compact",void 0);customElements.define("weather-details",oa);var Qe=H`
  :host {
    display: block;
  }

  :host([hidden]) {
    display: none;
  }

  .forecast-container {
    margin-top: 20px;
    padding-top: 20px;
    padding-bottom: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    width: 100%;
  }

  .forecast-title {
    font-size: 14px;
    font-weight: 500;
    opacity: 0.8;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 12px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }

  .forecast-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .forecast-scroll::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .forecast-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }

  .forecast-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  /* Items share the width when they fit (e.g. a provider with only two days), and scroll when they don't */
  .forecast-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1 0 auto;
    min-width: 60px;
  }

  /* Hourly forecast spanning several days: the first hour of each new day */
  .forecast-day {
    min-height: 14px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    opacity: 0.85;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-item.day-start {
    position: relative;
  }

  .forecast-item.day-start::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 0;
    bottom: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.25);
  }

  .forecast-time {
    font-size: 12px;
    opacity: 0.7;
    font-weight: 400;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-icon {
    line-height: 1;
    filter: var(--card-icon-filter);
  }

  .forecast-icon svg {
    width: 32px;
    height: 32px;
    display: block;
  }

  .forecast-temp {
    font-size: 16px;
    font-weight: 500;
    opacity: 0.9;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-temp-low {
    margin-left: 4px;
    font-size: 14px;
    font-weight: 400;
    opacity: 0.6;
  }

  .temp-bar {
    position: relative;
    width: 6px;
    height: 48px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
  }

  .temp-bar-fill {
    position: absolute;
    left: 0;
    right: 0;
    min-height: 6px;
    border-radius: 3px;
  }

  .temp-bar-now {
    position: absolute;
    left: 50%;
    width: 8px;
    height: 8px;
    margin: 0 0 -4px -4px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.35);
  }

  .forecast-temp-low-bar {
    font-size: 14px;
    font-weight: 400;
    opacity: 0.6;
  }

  /* Text in the card's own color, readable on any sky; the blue drop marks it as precipitation */
  .forecast-precipitation {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.9;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-precipitation::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 0 50% 50% 50%;
    transform: rotate(45deg);
    background: #4fb3ff;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.25);
  }

  .forecast-wind {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 11px;
    white-space: nowrap;
    opacity: 0.85;
    text-shadow: var(--card-text-shadow);
  }

  .forecast-wind-arrow {
    display: inline-flex;
    filter: var(--card-icon-filter);
  }

  .forecast-wind-arrow svg {
    width: 11px;
    height: 11px;
  }

  .forecast-wind-gust,
  .forecast-wind-unit {
    opacity: 0.7;
  }

  .forecast-wind-unit {
    margin-left: 1px;
    font-size: 10px;
  }

  /* Hourly temperature chart: each item draws its part of the curve, across half the gap on each side */
  .forecast-chart {
    position: relative;
    align-self: stretch;
    margin: 0 -8px;
  }

  .forecast-chart svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .chart-line {
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
  }

  .chart-dot {
    position: absolute;
    left: 50%;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  }

  .chart-label {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 15px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
    text-shadow: var(--card-text-shadow);
  }

  .chart-bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 18px;
    margin-left: -9px;
    border-radius: 3px 3px 0 0;
    background: rgba(79, 179, 255, 0.55);
  }

  .forecast-unavailable {
    opacity: 0.6;
    font-size: 14px;
  }
`;function Te(e,t){if(!t)return"";let i=ea(e,t.fromUnit,t.toUnit);if(!i)return"";return _`
    <div class="forecast-wind">
      ${i.bearing!==null?_`<span class="forecast-wind-arrow">${Ke(i.bearing)}</span>`:""}
      <span>${i.speed}${i.gust!==null?_`<span class="forecast-wind-gust">/${i.gust}</span>`:""}</span>
      <span class="forecast-wind-unit">${t.unit}</span>
    </div>
  `}var E=(e)=>Math.round(e*100)/100;function ra(e,t){if(e.length===0)return[];let i=Math.min(...e),a=Math.max(...e),n=Math.max(a-i,t.minRange??0),o=(i+a-n)/2,r=(h)=>n===0?(t.top+t.bottom)/2:t.bottom-(h-o)/n*(t.bottom-t.top),s=e.map(r),l=s.length-1,u=s.map((h,p)=>{if(l===0)return 0;if(p===0)return s[1]-h;if(p===l)return h-s[p-1];return(s[p+1]-s[p-1])/2}),d=(h)=>({y:(s[h]+s[h+1])/2+(u[h]-u[h+1])/8,slope:1.5*(s[h+1]-s[h])-(u[h]+u[h+1])/4});return s.map((h,p)=>{let c=[],y=`M50 ${E(h)}`;if(p>0){let w=d(p-1);y=`M0 ${E(w.y)}`,c.push(`C${E(16.666666666666668)} ${E(w.y+w.slope/6)} ${E(33.333333333333336)} ${E(h-u[p]/6)} 50 ${E(h)}`)}if(p<l){let w=d(p);c.push(`C${E(66.66666666666667)} ${E(h+u[p]/6)} ${E(83.33333333333333)} ${E(w.y-w.slope/6)} 100 ${E(w.y)}`)}return{y:E(h),line:c.length>0?`${y} ${c.join(" ")}`:""}})}var G=[[-20,[94,92,230]],[-5,[10,132,255]],[5,[100,210,255]],[15,[48,209,88]],[22,[255,214,10]],[28,[255,159,10]],[35,[255,69,58]]];function se(e,t="°C"){let i=/F/i.test(t)?(e-32)*5/9:e,a=G.length-1;if(i<=G[0][0])return`rgb(${G[0][1].join(", ")})`;if(i>=G[a][0])return`rgb(${G[a][1].join(", ")})`;let n=G.findIndex(([d])=>d>i),[o,r]=G[n-1],[s,l]=G[n],u=(i-o)/(s-o);return`rgb(${r.map((d,h)=>Math.round(d+(l[h]-d)*u)).join(", ")})`}var K={height:84,top:26,bottom:60,barsTop:66};class sa extends z{constructor(){super(...arguments);this.forecast=[];this.forecastTitle=null;this.clockFormat="24h";this.lang="en";this.wind=null;this.chart=!1;this.temperatureUnit="°C";this._cleanup=null;this.chartRange={min:0,max:0}}static styles=Qe;connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._cleanup=Le(this.shadowRoot,".forecast-scroll")})}disconnectedCallback(){super.disconnectedCallback(),this._cleanup?.(),this._cleanup=null}getTemperature(e){return Math.round(e.temperature??e.temp??e.native_temperature??0)}getWeekday(e){try{return new Date(e).toLocaleDateString(this.lang,{weekday:"short"})}catch{return new Date(e).toLocaleDateString(void 0,{weekday:"short"})}}renderItem(e,t,i,a,n){let o=e.precipitation_probability;return _`
      <div class="forecast-item ${t?"day-start":""}">
        ${i?_`<div class="forecast-day">${t?this.getWeekday(e.datetime):""}</div>`:""}
        <div class="forecast-time">${Ei(e.datetime,this.clockFormat,g.t("am"),g.t("pm"))}</div>
        <div class="forecast-icon">${Ce(e.condition||"sunny")}</div>
        ${a?this.renderChartPiece(e,a,n):_`<div class="forecast-temp">${this.getTemperature(e)}°</div>`}
        ${Te(e,this.wind)}
        ${o!=null&&o>0?_`<div class="forecast-precipitation">${Math.round(o)}%</div>`:""}
      </div>
    `}renderChartPiece(e,t,i){let a=this.getTemperature(e),n=Math.max(0,Math.min(100,e.precipitation_probability??0)),o=this.chartRange,r=`chart-gradient-${i}`,s=[0,0.25,0.5,0.75,1].map((l)=>b`<stop offset="${l}" stop-color="${se(o.max-l*(o.max-o.min),this.temperatureUnit)}"></stop>`);return _`
      <div class="forecast-chart" style="height: ${K.height}px">
        <svg viewBox="0 0 100 ${K.height}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="${r}" gradientUnits="userSpaceOnUse" x1="0" y1="${K.top}" x2="0" y2="${K.bottom}">${s}</linearGradient>
          </defs>
          ${t.line?b`<path class="chart-line" d="${t.line}" stroke="url(#${r})"></path>`:""}
        </svg>
        <span class="chart-dot" style="top: ${t.y}px; background: ${se(a,this.temperatureUnit)}"></span>
        <span class="chart-label" style="top: ${t.y-22}px">${a}°</span>
        ${n>0?_`<span class="chart-bar" style="height: ${Math.max(2,n/100*(K.height-K.barsTop))}px"></span>`:""}
      </div>
    `}render(){if(this.forecast.length===0)return _``;let e=Ri(this.forecast),t=e.some(Boolean),i=this.forecast.map((o)=>this.getTemperature(o)),a=this.temperatureUnit.includes("F")?10:6,n=this.chart?ra(i,{top:K.top,bottom:K.bottom,minRange:a}):null;return this.chartRange={min:Math.min(...i),max:Math.max(...i)},_`
      <div class="forecast-container">
        ${this.forecastTitle!==""?_`<div class="forecast-title">${this.forecastTitle??g.t(t?"forecast_title_hourly":"forecast_title")}</div>`:""}
        <div class="forecast-scroll">
          ${this.forecast.map((o,r)=>this.renderItem(o,e[r],t,n?.[r]??null,r))}
        </div>
      </div>
    `}}v([k({type:Array})],sa.prototype,"forecast",void 0),v([k({type:String})],sa.prototype,"forecastTitle",void 0),v([k({type:String})],sa.prototype,"clockFormat",void 0),v([k({type:String})],sa.prototype,"lang",void 0),v([k({attribute:!1})],sa.prototype,"wind",void 0),v([k({type:Boolean})],sa.prototype,"chart",void 0),v([k({type:String})],sa.prototype,"temperatureUnit",void 0);customElements.define("hourly-forecast",sa);function la(e){return new Date(e).toDateString()===new Date().toDateString()}class ua extends z{constructor(){super(...arguments);this.forecast=[];this.forecastTitle=null;this.lang="en";this.wind=null;this.showBars=!1;this.currentTemperature=null;this.temperatureUnit="°C";this._cleanup=null}static styles=Qe;connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._cleanup=Le(this.shadowRoot,".forecast-scroll")})}disconnectedCallback(){super.disconnectedCallback(),this._cleanup?.(),this._cleanup=null}getTemperature(e){return Math.round(e.temperature??e.temp??e.native_temperature??0)}getLowTemperature(e){let t=e.templow??e.native_templow;return t!=null?Math.round(t):null}getPrecipitationProbability(e){let t=e.precipitation_probability;return t!=null&&t>0?Math.round(t):null}renderBarItem(e,t){let i=this.getTemperature(e),a=this.getLowTemperature(e)??i,n=this.getPrecipitationProbability(e),o=Math.max(1,t.max-t.min),r=(t.max-i)/o*100,s=(a-t.min)/o*100,l=`top: ${r}%; bottom: ${s}%; background: linear-gradient(to top, ${se(a,this.temperatureUnit)}, ${se(i,this.temperatureUnit)});`,u="";if(this.currentTemperature!=null&&la(e.datetime)){let d=Math.max(t.min,Math.min(t.max,this.currentTemperature));u=_`<div class="temp-bar-now" style="bottom: ${(d-t.min)/o*100}%"></div>`}return _`
      <div class="forecast-item">
        <div class="forecast-time">${dt(e.datetime,this.lang)}</div>
        <div class="forecast-icon">${Ce(e.condition||"sunny")}</div>
        <div class="forecast-temp">${i}°</div>
        <div class="temp-bar">
          <div class="temp-bar-fill" style="${l}"></div>
          ${u}
        </div>
        <div class="forecast-temp forecast-temp-low-bar">${a}°</div>
        ${Te(e,this.wind)}
        ${n!==null?_`<div class="forecast-precipitation">${n}%</div>`:""}
      </div>
    `}renderItem(e){let t=this.getLowTemperature(e),i=this.getPrecipitationProbability(e);return _`
      <div class="forecast-item">
        <div class="forecast-time">${dt(e.datetime,this.lang)}</div>
        <div class="forecast-icon">${Ce(e.condition||"sunny")}</div>
        <div class="forecast-temp">
          ${this.getTemperature(e)}°${t!==null?_`<span class="forecast-temp-low">${t}°</span>`:""}
        </div>
        ${Te(e,this.wind)}
        ${i!==null?_`<div class="forecast-precipitation">${i}%</div>`:""}
      </div>
    `}renderItems(){if(!this.showBars)return this.forecast.map((i)=>this.renderItem(i));let e=this.forecast.flatMap((i)=>{let a=this.getLowTemperature(i);return a!==null?[this.getTemperature(i),a]:[this.getTemperature(i)]});if(this.currentTemperature!=null&&this.forecast.some((i)=>la(i.datetime)))e.push(Math.round(this.currentTemperature));let t={min:Math.min(...e),max:Math.max(...e)};return this.forecast.map((i)=>this.renderBarItem(i,t))}render(){if(this.forecast.length===0)return _``;return _`
      <div class="forecast-container">
        ${this.forecastTitle!==""?_`<div class="forecast-title">${this.forecastTitle??g.t("daily_forecast_title")}</div>`:""}
        <div class="forecast-scroll">
          ${this.renderItems()}
        </div>
      </div>
    `}}v([k({type:Array})],ua.prototype,"forecast",void 0),v([k({type:String})],ua.prototype,"forecastTitle",void 0),v([k({type:String})],ua.prototype,"lang",void 0),v([k({attribute:!1})],ua.prototype,"wind",void 0),v([k({type:Boolean})],ua.prototype,"showBars",void 0),v([k({type:Number})],ua.prototype,"currentTemperature",void 0),v([k({type:String})],ua.prototype,"temperatureUnit",void 0);customElements.define("daily-forecast",ua);class Ht extends z{static get styles(){return Wi}static getConfigElement(){return document.createElement("dynamic-weather-card-editor")}static getStubConfig(){return{type:"custom:dynamic-weather-card",entity:"weather.home",show_hourly_forecast:!0,hourly_forecast_hours:m.hourlyForecastHours,show_daily_forecast:!0,daily_forecast_days:m.dailyForecastDays}}constructor(){super();this.subscriptionKey=null;this.config={},this.animationManager=new Rt(()=>this.getDrawParams()),this.forecastService=new jt(()=>this.requestUpdate()),this.actionHandler=new Nt(()=>this.hass,()=>this.config,(e,t)=>this.fireEvent(e,t))}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{setTimeout(()=>{let e=this.shadowRoot?.querySelector(".canvas-container");if(e)this.animationManager.setup(e)},100)})}disconnectedCallback(){super.disconnectedCallback(),this.animationManager.destroy(),this.forecastService.unsubscribe(),this.subscriptionKey=null}updated(e){if(super.updated(e),e.has("config")){let i=e.get("config"),a=i?i.showAnimations!==!1:!0,n=this.config.showAnimations!==!1;if(a&&!n)this.animationManager.destroy();else if(!a&&n)this.updateComplete.then(()=>{let o=this.shadowRoot?.querySelector(".canvas-container");if(o)this.animationManager.setup(o)})}if(e.has("hass")||e.has("config")){let i=this.config.entity,a={daily:this.config.showDailyForecast??!1,twiceDaily:this.config.showForecastDescription??!1},n=`${i}|${a.daily}|${a.twiceDaily}`;if(this.hass&&i&&n!==this.subscriptionKey)this.subscriptionKey=n,this.forecastService.subscribe(this.hass,i,a)}let t=ye({configLang:this.config?.language,hassLang:this.hass?.language});if(g.lang!==t)g.setLanguage(t)}getDrawParams(){if(!this.hass||!this.config.entity)return null;let e=It(this.hass,this.config.entity,this.config,this.forecastService.getHourlyData()),t=this.hass.states[this.config.entity],i=ht(t||{},this.config.sunriseEntity,this.config.sunsetEntity,this.hass),a=this._testTimeOfDay||ct(i);return{condition:e.condition,timeOfDay:a,sunPosition:{x:this.config.sunPositionX,y:this.config.sunPositionY},moonPhase:this._testMoonPhase??void 0,visualStyle:this.config.visualStyle,quality:this.config.animationQuality,windSpeed:this.getWindSpeedMs(e),aurora:this.config.showAurora===!0,raindrops:this.config.showRaindrops!==!1,windEffects:this.config.showWindEffects!==!1}}getWindSpeedMs(e){if(e.windSpeed==null||!this.hass)return null;let t=V(this.hass,this.config.entity),i=e.windSpeedUnit??(typeof t.wind_speed_unit==="string"?t.wind_speed_unit:"m/s");return W(e.windSpeed,i,"m/s")}renderPrecipitationOutlook(e){if(!this.config.showPrecipitationOutlook)return _``;let t=this.forecastService.getHourlyData(),i=aa(e.condition,t.length>0?t:e.forecast,this._testNow??new Date);if(!i)return _``;let a=i.time?we(i.time,this.config.clockFormat??"24h",g.t("am"),g.t("pm")):"",o=g.t(`precipitation_outlook.${i.type==="start"&&!i.time?"soon":i.type}`).replace("{kind}",g.t(`precipitation_outlook.${i.kind}`)).replace("{time}",a).replace("{hours}",String(i.hours));return _`
      <div class="precipitation-outlook">
        <span class="info-icon">${U("precipitation")}</span>
        <span>${o}</span>
      </div>
    `}renderForecastDescription(e){if(!this.config.showForecastDescription)return _``;let t=this.forecastService.getForecastDescription(e,this._testNow??new Date);if(!t)return _``;return _`<div class="forecast-description" title="${t}">${t}</div>`}getDetailsConfig(){return{showHumidity:this.config.showHumidity??!0,showPressure:this.config.showPressure??!1,showUvIndex:this.config.showUvIndex??!1,showDewPoint:this.config.showDewPoint??!1,showWind:this.config.showWind??!0,showWindGust:this.config.showWindGust??!0,showWindDirection:this.config.showWindDirection??!0,showSunriseSunset:this.config.showSunriseSunset??!0,clockFormat:this.config.clockFormat??"24h",windSpeedUnit:this.config.windSpeedUnit??m.windSpeedUnit}}setConfig(e){if(!e.entity)throw Error("Please define a weather entity");let t=e.show_hourly_forecast??e.show_forecast;if(this.config={type:"custom:dynamic-weather-card",entity:e.entity,name:e.name,height:e.height||m.height,showFeelsLike:e.show_feels_like!==!1,showWind:e.show_wind!==!1,showWindGust:e.show_wind_gust!==!1,showWindDirection:e.show_wind_direction!==!1,showHumidity:e.show_humidity!==!1,showPressure:e.show_pressure===!0,showUvIndex:e.show_uv_index===!0,showDewPoint:e.show_dew_point===!0,showMinTemp:e.show_min_temp!==!1,showPrecipitationOutlook:e.show_precipitation_outlook===!0,showAurora:e.show_aurora===!0,showRaindrops:e.show_raindrops!==!1,showWindEffects:e.show_wind_effects!==!1,showTemperatureBars:e.show_temperature_bars===!0,showForecastDescription:e.show_forecast_description===!0,showForecastWind:e.show_forecast_wind===!0,showForecast:e.show_forecast===!0,showHourlyForecast:t===!0,showDailyForecast:e.show_daily_forecast===!0,hourlyForecastHours:e.hourly_forecast_hours??m.hourlyForecastHours,hourlyForecastStep:e.hourly_forecast_step??m.hourlyForecastStep,hourlyForecastChart:e.hourly_forecast_chart===!0,dailyForecastDays:e.daily_forecast_days??m.dailyForecastDays,hourlyForecastTitle:e.hourly_forecast_title??m.hourlyForecastTitle,dailyForecastTitle:e.daily_forecast_title??m.dailyForecastTitle,showSunriseSunset:e.show_sunrise_sunset!==!1,showClock:e.show_clock===!0,showDate:e.show_date===!0,clockPosition:e.clock_position||m.clockPosition,clockFormat:e.clock_format||m.clockFormat,overlayOpacity:e.overlay_opacity!==void 0?e.overlay_opacity:m.overlayOpacity,textShadow:e.text_shadow!==void 0?e.text_shadow:m.textShadow,borderRadius:e.border_radius??m.borderRadius,sunPositionX:e.sun_position_x??m.sunPositionX,sunPositionY:e.sun_position_y??m.sunPositionY,textColor:e.text_color?.trim()||m.textColor,language:e.language||m.language,windSpeedUnit:Ie.includes(e.wind_speed_unit)?e.wind_speed_unit:m.windSpeedUnit,showAnimations:e.show_animations!==!1,layout:e.layout||m.layout,visualStyle:e.visual_style==="classic"?"classic":"modern",animationQuality:e.animation_quality==="medium"||e.animation_quality==="low"?e.animation_quality:m.animationQuality,sunriseEntity:e.sunrise_entity||null,sunsetEntity:e.sunset_entity||null,templowAttribute:e.templow_attribute||null,sensorEntities:{temperature:e.temperature_entity||null,feelsLike:e.feels_like_entity||null,humidity:e.humidity_entity||null,windSpeed:e.wind_speed_entity||null,windGust:e.wind_gust_entity||null,windBearing:e.wind_bearing_entity||null,precipitation:e.precipitation_entity||null,pressure:e.pressure_entity||null,uvIndex:e.uv_index_entity||null,dewPoint:e.dew_point_entity||null,aqi:e.aqi_entity||null},tapAction:e.tap_action||{action:"more-info"},holdAction:e.hold_action||{action:"none"},doubleTapAction:e.double_tap_action||{action:"none"}},this.config.language)g.setLanguage(this.config.language)}fireEvent(e,t={}){let i=new CustomEvent(e,{detail:t,bubbles:!0,composed:!0});this.dispatchEvent(i)}getCardSize(){return 1}render(){if(!this.hass)return _`<div>No Home Assistant connection</div>`;let e=It(this.hass,this.config.entity,this.config,this.forecastService.getHourlyData()),t=this.hass.states[this.config.entity],i=ht(t,this.config.sunriseEntity,this.config.sunsetEntity,this.hass),a=this._testTimeOfDay||ct(i),n=`weather-card ${a.type}${this.config.visualStyle==="classic"?" classic":""}`,o=this.config.layout==="minimal",r=o?"56px":"200px",s=this.config.height?`${this.config.height}px`:r,l=this.config.visualStyle==="classic",u;if(l){let C=Fi(a);u=C?`background: linear-gradient(135deg, rgb(${C.start.r}, ${C.start.g}, ${C.start.b}), rgb(${C.end.r}, ${C.end.g}, ${C.end.b}));`:""}else{let C=q(e.condition,a);u=`--dwc-sky-top: ${F(C.top)}; --dwc-sky-bottom: ${F(C.bottom)};`}let h=`--overlay-opacity: ${this.config.overlayOpacity!==void 0?this.config.overlayOpacity:m.overlayOpacity};`,p=this.config.textShadow??m.textShadow,c=p===0?"none":[`0 1px 2px rgba(0,0,0,${Math.min(1,0.4*p).toFixed(2)})`,`0 2px 6px rgba(0,0,0,${Math.min(1,0.3*p).toFixed(2)})`,`0 4px 12px rgba(0,0,0,${Math.min(1,0.2*p).toFixed(2)})`].join(", "),y=p===0?"none":`drop-shadow(0px 1px 3px rgba(0,0,0,${Math.min(1,0.6*p).toFixed(2)}))`,w=`--card-text-shadow: ${c}; --card-icon-filter: ${y};`,x=this.config.showHourlyForecast?this.forecastService.getHourlyForecast(this.config.hourlyForecastHours??m.hourlyForecastHours,e,this.config.hourlyForecastStep??m.hourlyForecastStep):[],T=this.config.showDailyForecast?this.forecastService.getDailyForecast(this.config.dailyForecastDays??m.dailyForecastDays,e):[],P=`min-height: ${s}; ${u} ${h} ${w} cursor: pointer;`,ue=this.config.borderRadius,Q=this.config.textColor&&CSS.supports("color",this.config.textColor)?this.config.textColor:null,de=[typeof ue==="number"&&ue>=0?`--dwc-border-radius: ${ue}px;`:"",Q?`--dwc-text-color: ${Q};`:""].join(" "),J=this.hass;return _`
      <ha-card
        style="${de}"
        @click=${(C)=>this.actionHandler.handleTap(C)}
        @pointerdown=${()=>this.actionHandler.handlePointerDown()}
        @pointerup=${(C)=>this.actionHandler.handlePointerUp(C)}
        @pointercancel=${(C)=>this.actionHandler.handlePointerUp(C)}
      >
        ${o?this.renderMinimal(e,i,J,n,P):this.renderDefault(e,i,x,T,J,n,P)}
      </ha-card>
    `}renderDefault(e,t,i,a,n,o,r){let s=this.getForecastWindOptions(n,e);return _`
      <div class="${o}" style="${r}">
        ${this.config.showAnimations!==!1?_`<div class="canvas-container"></div>`:""}
        <div class="content">
          ${this.config.name&&this.config.name.trim()!==""?_`
            <div class="header">
              <div class="location">${this.config.name}</div>
            </div>
          `:""}
          <div class="primary">
            <div class="primary-left">
              <div class="condition">${g.t(e.condition)}</div>
              <div class="temperature">${e.temperature!=null?Math.round(e.temperature)+"°":g.t("no_data")}</div>
              ${this.config.showMinTemp?_`
                <div class="temp-range">
                  <span class="temp-min">↓ ${e.templow!=null?`${Math.round(e.templow)}°`:g.t("no_data")}</span>
                </div>
              `:""}
              ${this.config.showFeelsLike?_`
                <div class="feels-like">${g.t("feels_like")} ${e.apparentTemperature!=null?`${Math.round(e.apparentTemperature)}°`:g.t("no_data")}</div>
              `:""}
              ${this.renderPrecipitationOutlook(e)}
            </div>
            <weather-clock
              .format=${this.config.showClock&&this.config.clockPosition==="top"?this.config.clockFormat:null}
              .showDate=${!!this.config.showDate&&this.config.clockPosition==="top"}
              .lang=${g.lang}
            ></weather-clock>
          </div>
          <div class="details ${(this.config.showClock||this.config.showDate)&&this.config.clockPosition==="details"?"details--clock":""}">
            <weather-details
              .weather=${e}
              .sunData=${t}
              .config=${this.getDetailsConfig()}
              .entityAttributes=${V(n,this.config.entity)}
            ></weather-details>
            <weather-clock
              .format=${this.config.showClock&&this.config.clockPosition==="details"?this.config.clockFormat:null}
              .showDate=${!!this.config.showDate&&this.config.clockPosition==="details"}
              .lang=${g.lang}
            ></weather-clock>
          </div>
          ${this.renderForecastDescription(e)}
          <hourly-forecast
            .forecast=${i}
            .wind=${s}
            .chart=${this.config.hourlyForecastChart===!0}
            .temperatureUnit=${V(n,this.config.entity).temperature_unit??n.config?.unit_system?.temperature??"°C"}
            .lang=${g.lang}
            .clockFormat=${this.config.clockFormat??"24h"}
            .forecastTitle=${this.config.hourlyForecastTitle??null}
          ></hourly-forecast>
          <daily-forecast
            .forecast=${a}
            .wind=${s}
            .lang=${g.lang}
            .forecastTitle=${this.config.dailyForecastTitle??null}
            .showBars=${this.config.showTemperatureBars===!0}
            .currentTemperature=${e.temperature}
            .temperatureUnit=${V(n,this.config.entity).temperature_unit??n.config?.unit_system?.temperature??"°C"}
          ></daily-forecast>
        </div>
      </div>
    `}getForecastWindOptions(e,t){if(!this.config.showForecastWind)return null;let i=V(e,this.config.entity).wind_speed_unit,a=typeof i==="string"&&i?i:"m/s",n=He(t.windSpeedUnit??a,this.config.windSpeedUnit??m.windSpeedUnit);return{fromUnit:a,toUnit:n,unit:_t(n,g.t.bind(g))}}renderMinimal(e,t,i,a,n){let o=e.temperature!=null?Math.round(e.temperature)+"°":g.t("no_data"),r=e.templow!=null?`↓ ${Math.round(e.templow)}°`:null;return _`
      <div class="${a} layout--minimal" style="${n}">
        ${this.config.showAnimations!==!1?_`<div class="canvas-container"></div>`:""}
        <div class="content">
          <div class="mini-primary">
            <div class="mini-temp">${o}</div>
            ${this.config.showMinTemp&&r?_`<div class="mini-temp-low">${r}</div>`:""}
          </div>
          <div class="mini-details">
            <div class="mini-condition">${g.t(e.condition)}</div>
            <weather-details
              .weather=${e}
              .sunData=${t}
              .config=${this.getDetailsConfig()}
              .entityAttributes=${V(i,this.config.entity)}
              .compact=${!0}
            ></weather-details>
          </div>
          ${this.config.showClock||this.config.showDate?_`
            <weather-clock
              .format=${this.config.showClock?this.config.clockFormat:null}
              .showDate=${!!this.config.showDate}
              .lang=${g.lang}
              .compact=${!0}
            ></weather-clock>
          `:""}
        </div>
      </div>
    `}}v([k({type:Object})],Ht.prototype,"hass",void 0),v([k({type:Object})],Ht.prototype,"config",void 0);function da(e,t){let i={};for(let a of["type","entity"])if(e[a]!==void 0)i[a]=e[a];for(let[a,n]of Object.entries(e)){if(a in i)continue;if(n===void 0||n===null||n==="")continue;if(a in t&&t[a]===n)continue;i[a]=n}return i}var M=(e)=>({name:e,selector:{boolean:{}}}),R=(...e)=>({name:"",type:"grid",schema:e}),le=(e,t)=>({name:e,selector:{select:{mode:"dropdown",options:t.map((i)=>({label:g.t(`editor.${e}_${i}`),value:i}))}}}),kn=(e)=>{let t=`editor.language_${e}`,i=g.t(t);if(i!==t)return i;try{let a=new Intl.DisplayNames([g.lang],{type:"language"}).of(e)??e;return a.charAt(0).toLocaleUpperCase(g.lang)+a.slice(1)}catch{return e}},ha=()=>({layout:m.layout,height:m.height,show_feels_like:m.showFeelsLike,show_wind:m.showWind,show_wind_gust:m.showWindGust,show_wind_direction:m.showWindDirection,show_humidity:m.showHumidity,show_pressure:m.showPressure,show_uv_index:m.showUvIndex,show_dew_point:m.showDewPoint,show_min_temp:m.showMinTemp,show_precipitation_outlook:m.showPrecipitationOutlook,show_temperature_bars:m.showTemperatureBars,show_forecast_wind:m.showForecastWind,show_forecast_description:m.showForecastDescription,show_aurora:m.showAurora,show_raindrops:m.showRaindrops,show_wind_effects:m.showWindEffects,show_hourly_forecast:m.showHourlyForecast,hourly_forecast_hours:m.hourlyForecastHours,hourly_forecast_step:m.hourlyForecastStep,hourly_forecast_chart:m.hourlyForecastChart,show_daily_forecast:m.showDailyForecast,daily_forecast_days:m.dailyForecastDays,show_sunrise_sunset:m.showSunriseSunset,show_animations:m.showAnimations,visual_style:m.visualStyle,animation_quality:m.animationQuality,show_clock:m.showClock,show_date:m.showDate,clock_position:m.clockPosition,clock_format:m.clockFormat,overlay_opacity:m.overlayOpacity,text_shadow:m.textShadow,language:m.language,wind_speed_unit:m.windSpeedUnit});class Lt extends z{constructor(){super(...arguments);this._config={};this._computeHelper=(e)=>{let t=`editor.${e.name}_helper`,i=g.t(t);return i===t?void 0:i};this._computeLabel=(e)=>{let t=`editor.${e.name}`,i=g.t(t);return i===t?e.name:i}}setConfig(e){let{show_forecast:t,...i}=e;this._config=i.show_hourly_forecast===void 0&&t!==void 0?{...i,show_hourly_forecast:t}:i}get _formData(){return{...ha(),...this._config}}willUpdate(e){if(super.willUpdate(e),e.has("hass")){let t=ye({hassLang:this.hass?.language});if(g.lang!==t)g.setLanguage(t)}}get _schema(){let e=this._formData,t=(a)=>e[a]===!0,i=(a,n,o)=>({name:a,type:"expandable",flatten:!0,title:g.t(`editor.section_${a}`),icon:n,schema:o});return[{name:"entity",required:!0,selector:{entity:{domain:["weather"]}}},{name:"name",selector:{text:{}}},R(le("layout",["default","minimal"]),{name:"height",selector:{number:{min:50,max:800,step:10,mode:"box",unit_of_measurement:"px"}}}),i("appearance","mdi:palette-outline",[R(le("visual_style",["modern","classic"]),le("animation_quality",["high","medium","low"])),R(M("show_animations"),M("show_aurora")),R(M("show_raindrops"),M("show_wind_effects")),R({name:"overlay_opacity",selector:{number:{min:0,max:1,step:0.05,mode:"box"}}},{name:"text_shadow",selector:{number:{min:0,max:3,step:1,mode:"box"}}}),R({name:"text_color",selector:{text:{}}},{name:"border_radius",selector:{number:{min:0,max:50,step:1,mode:"box",unit_of_measurement:"px"}}}),{name:"sun_position_x",selector:{number:{min:0,max:100,step:1,mode:"slider",unit_of_measurement:"%"}}},{name:"sun_position_y",selector:{number:{min:0,max:100,step:1,mode:"slider",unit_of_measurement:"%"}}}]),i("details","mdi:thermometer",[R(M("show_feels_like"),M("show_min_temp"),M("show_humidity"),M("show_pressure"),M("show_uv_index"),M("show_dew_point"),M("show_sunrise_sunset"),M("show_precipitation_outlook")),M("show_wind"),...t("show_wind")?[R(M("show_wind_gust"),M("show_wind_direction")),le("wind_speed_unit",[...Ie])]:[]]),i("forecast","mdi:calendar-clock",[M("show_hourly_forecast"),...t("show_hourly_forecast")?[R({name:"hourly_forecast_hours",selector:{number:{min:1,step:1,mode:"box"}}},{name:"hourly_forecast_step",selector:{number:{min:1,max:12,step:1,mode:"box",unit_of_measurement:"h"}}}),{name:"hourly_forecast_title",selector:{text:{}}},M("hourly_forecast_chart")]:[],M("show_daily_forecast"),...t("show_daily_forecast")?[R({name:"daily_forecast_days",selector:{number:{min:1,max:14,step:1,mode:"box"}}},{name:"daily_forecast_title",selector:{text:{}}}),M("show_temperature_bars")]:[],...t("show_hourly_forecast")||t("show_daily_forecast")?[M("show_forecast_wind")]:[],M("show_forecast_description")]),i("clock","mdi:clock-outline",[{name:"language",selector:{select:{mode:"dropdown",options:[{label:g.t("editor.language_auto"),value:"auto"},...Object.keys(j).map((a)=>({label:kn(a),value:a}))]}}},R(M("show_clock"),M("show_date")),...t("show_clock")||t("show_date")?[R(le("clock_position",["top","details"]),le("clock_format",["24h","12h"]))]:[]]),i("sensors","mdi:access-point",[...["temperature_entity","feels_like_entity","humidity_entity","wind_speed_entity","wind_gust_entity","wind_bearing_entity","precipitation_entity","pressure_entity","uv_index_entity","dew_point_entity","aqi_entity","sunrise_entity","sunset_entity"].map((a)=>({name:a,selector:{entity:{domain:["sensor"]}}}))])]}_valueChanged(e){let t=e.detail?.value;if(!t)return;this._config=da(t,ha()),this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:!0,composed:!0}))}render(){if(!this.hass)return _``;return _`
      <ha-form
        .hass=${this.hass}
        .data=${this._formData}
        .schema=${this._schema}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `}}v([k({attribute:!1})],Lt.prototype,"hass",void 0),v([fe()],Lt.prototype,"_config",void 0);var ca={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},Wt=(e)=>(...t)=>({_$litDirective$:e,values:t});class Ut{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,i){this._$Ct=e,this._$AM=t,this._$Ci=i}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}var{I:pu}=si;var pa=(e)=>e.strings===void 0;var Ae=(e,t)=>{let i=e._$AN;if(i===void 0)return!1;for(let a of i)a._$AO?.(t,!1),Ae(a,t);return!0},Je=(e)=>{let t,i;do{if((t=e._$AM)===void 0)break;i=t._$AN,i.delete(e),e=t}while(i?.size===0)},_a=(e)=>{for(let t;t=e._$AM;e=t){let i=t._$AN;if(i===void 0)t._$AN=i=new Set;else if(i.has(e))break;i.add(e),Sn(t)}};function bn(e){this._$AN!==void 0?(Je(this),this._$AM=e,_a(this)):this._$AM=e}function xn(e,t=!1,i=0){let a=this._$AH,n=this._$AN;if(n!==void 0&&n.size!==0)if(t)if(Array.isArray(a))for(let o=i;o<a.length;o++)Ae(a[o],!1),Je(a[o]);else a!=null&&(Ae(a,!1),Je(a));else Ae(this,e)}var Sn=(e)=>{e.type==ca.CHILD&&(e._$AP??=xn,e._$AQ??=bn)};class Ot extends Ut{constructor(){super(...arguments),this._$AN=void 0}_$AT(e,t,i){super._$AT(e,t,i),_a(this),this.isConnected=e._$AU}_$AO(e,t=!0){e!==this.isConnected&&(this.isConnected=e,e?this.reconnected?.():this.disconnected?.()),t&&(Ae(this,e),Je(this))}setValue(e){if(pa(this._$Ct))this._$Ct._$AI(e,this);else{let t=[...this._$Ct._$AH];t[this._$Ci]=e,this._$Ct._$AI(t,this,0)}}disconnected(){}reconnected(){}}class ma extends Ot{constructor(){super(...arguments);this._key="";this._onLangChange=null}render(e){return this._key=e,g.t(e)}reconnected(){this._onLangChange=()=>{this.setValue(g.t(this._key))},window.addEventListener("language-changed",this._onLangChange)}disconnected(){if(this._onLangChange)window.removeEventListener("language-changed",this._onLangChange)}}var Mn=Wt(ma);try{Bi(),customElements.define("dynamic-weather-card",Ht),customElements.define("dynamic-weather-card-editor",Lt),console.log(`%cDynamic Weather Card %c${ui}`,"color: #007AFF; font-weight: bold; font-size: 14px;","color: #666; font-size: 12px;",`
Динамическая карточка погоды`),window.customCards=window.customCards||[];let e={type:"dynamic-weather-card",name:"Dynamic Weather Card",description:"Динамическая карточка погоды",preview:!0,documentationURL:"https://github.com/teuchezh/dynamic-weather-card"};window.customCards.push(e)}catch(e){console.error("❌ Ошибка при регистрации Dynamic Weather Card:",e)}export{g as i18n,ye as resolveLanguage,Mn as t};
