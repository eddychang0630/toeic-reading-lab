// Uses the existing Git Credential Manager session. Secrets stay in process memory.
import {execFileSync} from 'node:child_process';
const owner='eddychang0630',repo='toeic-reading-lab';
const mode=process.argv[2]||'status';
function git(args,input){return execFileSync('git',args,{encoding:'utf8',input,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},stdio:['pipe','pipe','pipe']});}
let credential;
try{const raw=git(['credential','fill'],'protocol=https\nhost=github.com\n\n');credential=Object.fromEntries(raw.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));}catch{throw Error('Existing GitHub login unavailable.');}
if(!credential.password)throw Error('GitHub credential missing.');
async function api(endpoint,method='GET',body,allowed=[]){const response=await fetch('https://api.github.com'+endpoint,{method,headers:{Authorization:'Bearer '+credential.password,'User-Agent':'ReadLab-deployment','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=response.status===204?{}:await response.json();if(!response.ok&&!allowed.includes(response.status))throw Error(`GitHub ${method} ${endpoint}: ${response.status} ${data.message||''}`);return{status:response.status,data};}
const profile=(await api('/user')).data;
if(profile.login!==owner)throw Error('The current GitHub login does not match the intended account.');
if(mode==='inspect'){const r=await api(`/repos/${owner}/${repo}`,'GET',undefined,[404]);console.log(JSON.stringify({owner,repo,exists:r.status===200,default_branch:r.data.default_branch,url:r.data.html_url}));}
else if(mode==='create'){let r=await api(`/repos/${owner}/${repo}`,'GET',undefined,[404]);if(r.status===404)r=await api('/user/repos','POST',{name:repo,description:'ReadLab 多益閱讀練習室：手機優先的 Part 5–7 自學 PWA，含完整文法講義、錯題複習與商務詞彙。',private:false,auto_init:false});console.log(JSON.stringify({created:r.status===201,url:r.data.html_url,default_branch:r.data.default_branch}));}
else if(mode==='enable-pages'){const endpoint=`/repos/${owner}/${repo}/pages`;const r=await api(endpoint,'GET',undefined,[404]);const config={build_type:'legacy',source:{branch:'main',path:'/'}};const p=await api(endpoint,r.status===404?'POST':'PUT',config);console.log(JSON.stringify({url:p.data.html_url||`https://${owner}.github.io/${repo}/`,status:p.data.status,source:p.data.source}));}
else if(mode==='build'){const r=await api(`/repos/${owner}/${repo}/pages/builds`,'POST',{});console.log(JSON.stringify({status:r.data.status,url:r.data.url}));}
else if(mode==='status'){const [pages,build]=await Promise.all([api(`/repos/${owner}/${repo}/pages`,'GET',undefined,[404]),api(`/repos/${owner}/${repo}/pages/builds/latest`,'GET',undefined,[404])]);console.log(JSON.stringify({url:pages.data.html_url,status:pages.data.status,build:build.data.status,commit:build.data.commit,error:build.data.error,updated_at:build.data.updated_at}));}
else throw Error('Unknown deployment action.');
