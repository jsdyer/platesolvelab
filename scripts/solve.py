#!/usr/bin/env python3
"""Owner-only Astrometry API client. Never prints credentials, sessions or source URLs."""
import argparse,datetime,ipaddress,json,math,os,re,sys,time,urllib.error,urllib.parse,urllib.request
from pathlib import Path
BASE='https://nova.astrometry.net'

def identifier(value):
    if not re.fullmatch(r'[0-9]{1,12}',str(value)) or int(value)<1: raise ValueError('Use a positive numeric job/submission ID.')
    return str(int(value))

def public_url(value):
    u=urllib.parse.urlsplit(value)
    h=(u.hostname or '').lower()
    try: ipaddress.ip_address(h); numeric=True
    except ValueError: numeric=False
    if u.scheme!='https' or not h or '.' not in h or numeric or u.username or u.password or u.port or u.fragment or h=='localhost' or any(h.endswith(x) for x in ('.local','.internal','.localhost','.test','.invalid')):
        raise ValueError('Image URL must use a public HTTPS hostname, without credentials, port or fragment.')
    return value

def solve_options(lower=None,upper=None):
    options={'publicly_visible':'n','allow_commercial_use':'n','allow_modifications':'n','downsample_factor':2}
    if lower is not None or upper is not None:
        if lower is None or upper is None or not (0<float(lower)<float(upper)<=180): raise ValueError('Supply both scale bounds: 0 < lower < upper <= 180 degrees.')
        options.update(scale_units='degwidth',scale_type='ul',scale_lower=float(lower),scale_upper=float(upper))
    return options

def request(path,payload=None):
    if not re.fullmatch(r'/api/(?:login|url_upload|jobs/[0-9]+/(?:info|calibration)/|submissions/[0-9]+)',path): raise ValueError('Unsupported provider path.')
    body=urllib.parse.urlencode({'request-json':json.dumps(payload)}).encode() if payload is not None else None
    req=urllib.request.Request(BASE+path,data=body,headers={'User-Agent':'CoolCodePlateSolveLab/1.0 (https://coolcode.ca/platesolvelab/)','Content-Type':'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req,timeout=35) as response:
            raw=response.read(2_000_001)
        if len(raw)>2_000_000: raise ValueError('Provider response exceeded the metadata size limit.')
        data=json.loads(raw)
    except urllib.error.HTTPError as exc: raise RuntimeError(f'Astrometry returned HTTP {exc.code}.') from None
    except (urllib.error.URLError,TimeoutError): raise RuntimeError('Astrometry connection failed or timed out.') from None
    except (UnicodeDecodeError,json.JSONDecodeError): raise RuntimeError('Astrometry did not return valid JSON.') from None
    if not isinstance(data,dict) or data.get('status')=='error': raise RuntimeError('Astrometry rejected the request. Check account/API settings; provider details were omitted to protect credentials.')
    return data

def get_receipt(job_id):
    jid=identifier(job_id); info=request(f'/api/jobs/{jid}/info/');cal=request(f'/api/jobs/{jid}/calibration/')
    if info.get('status')!='success' or not all(isinstance(cal.get(k),(float,int)) and math.isfinite(cal[k]) for k in ('ra','dec','radius','pixscale','orientation','parity')): raise ValueError('Job has no successful calibration yet.')
    return {'schema':'coolcode.platesolve.v1','jobId':jid,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'name':str(info.get('original_filename',f'Job {jid}'))[:200],'calibration':{k:cal[k] for k in ('ra','dec','radius','pixscale','orientation','parity','width_arcsec','height_arcsec') if k in cal},'objects':[s[:200] for s in info.get('objects_in_field',[]) if isinstance(s,str)][:200]}

def login():
    key=os.environ.get('ASTROMETRY_API_KEY','').strip()
    if not key: raise ValueError('ASTROMETRY_API_KEY is missing from repository Actions secrets.')
    result=request('/api/login',{'apikey':key})
    session=result.get('session')
    if not isinstance(session,str) or not session: raise RuntimeError('Login did not return a session. Check the saved API key.')
    return session

def write_receipt(value,directory):
    directory.mkdir(parents=True,exist_ok=True)
    output=directory/'receipt.json';output.write_text(json.dumps(value,indent=2)+'\n')
    print(f'Receipt saved for job {value["jobId"]}. Import receipt.json at https://coolcode.ca/platesolvelab/')
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary,'a') as f:f.write(f'## Plate Solve Lab\n\nJob **{value["jobId"]}** solved. Download the **plate-solve-receipt** artifact, unzip it and import `receipt.json` at [Plate Solve Lab](https://coolcode.ca/platesolvelab/).\n\n[Provider calibration]({BASE}/api/jobs/{value["jobId"]}/calibration/) · [Annotated image]({BASE}/annotated_display/{value["jobId"]})\n')

def main():
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--job-id');group.add_argument('--image-url');group.add_argument('--submission-id');group.add_argument('--check-key',action='store_true')
    parser.add_argument('--lower',type=float);parser.add_argument('--upper',type=float);parser.add_argument('--output',default='receipts');parser.add_argument('--max-polls',type=int,default=36)
    args=parser.parse_args();out=Path(args.output)
    if args.check_key: login();print('Astrometry API key authenticated. No image submitted.');return
    if args.job_id: write_receipt(get_receipt(args.job_id),out);return
    if args.image_url:
        url=public_url(args.image_url);options=solve_options(args.lower,args.upper);options.update(session=login(),url=url)
        submitted=request('/api/url_upload',options);subid=identifier(submitted.get('subid',''))
    else: subid=identifier(args.submission_id)
    print(f'Submission ID: {subid}. No photo bytes are saved in this repository.')
    out.mkdir(parents=True,exist_ok=True);(out/'submission.json').write_text(json.dumps({'schema':'coolcode.platesolve.submission.v1','submissionId':subid,'statusUrl':f'{BASE}/status/{subid}','note':'Not a solved receipt. Resume this ID using the workflow.'},indent=2)+'\n')
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary,'a') as f:f.write(f'### Submission {subid}\n\n[Provider processing page]({BASE}/status/{subid}). If processing exceeds this workflow\'s bounded wait, rerun with submission ID `{subid}` to resume without uploading again.\n')
    for n in range(min(60,max(1,args.max_polls))):
        data=request(f'/api/submissions/{subid}');jobs=[j for j in data.get('jobs',[]) if j]
        for job in jobs:
            info=request(f'/api/jobs/{identifier(job)}/info/')
            if info.get('status')=='success':write_receipt(get_receipt(job),out);return
        if jobs and data.get('processing_finished') and all(request(f'/api/jobs/{identifier(j)}/info/').get('status')=='failure' for j in jobs): raise RuntimeError('No successful solve. Try a clearer image or useful field-width bounds.')
        if n+1<min(60,max(1,args.max_polls)):time.sleep(10)
    print(f'Processing continues at Astrometry. Resume submission {subid}; do not resubmit the photo.')

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError) as exc:print(str(exc),file=sys.stderr);sys.exit(1)
