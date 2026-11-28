/**
 * Runs before first paint, like the theme script beside it in the root layout.
 *
 * Marks the page when it is running inside the native phone app (mobile/), so
 * the styles can hand the screen edges over to the app from the very first
 * frame (see --safe-bottom in globals.css), and applies the edge sizes if the
 * app has already supplied them.
 *
 * The desktop program also carries "TCNPApp/" in its user agent, but it is an
 * ordinary window with no phone edges, so it is left alone.
 */
export const NATIVE_BOOTSTRAP_SCRIPT = `(()=>{try{var w=window,d=document.documentElement,u=navigator.userAgent||'';if(!(w.ReactNativeWebView||(/TCNPApp\\//.test(u)&&!/TCNPDesktop\\//.test(u))))return;d.setAttribute('data-tcnp-native','');var i=w.__TCNP_NATIVE__&&w.__TCNP_NATIVE__.insets;if(i){['top','bottom'].forEach(function(k){var v=Number(i[k]);if(v>=0&&v<200)d.style.setProperty('--native-safe-'+k,v+'px')})}}catch(e){}})()`
