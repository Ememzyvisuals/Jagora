/** Runs in <head> before paint so a dark-mode user never sees a white flash. Light is the default. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("jagora:theme")==="dark")document.documentElement.dataset.theme="dark";var f=localStorage.getItem("jagora:font");if(f==="galgo"||f==="climate")document.documentElement.dataset.font=f}catch(e){}`;
