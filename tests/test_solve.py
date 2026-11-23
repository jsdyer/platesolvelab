import contextlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
SPEC=importlib.util.spec_from_file_location('solve',Path(__file__).resolve().parents[1]/'scripts/solve.py');solve=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(solve)
class SolveTests(unittest.TestCase):
 def test_private_no_reuse_defaults(self):
  o=solve.solve_options();self.assertEqual((o['publicly_visible'],o['allow_commercial_use'],o['allow_modifications']),('n','n','n'))
 def test_bounds(self):
  self.assertEqual(solve.solve_options(1,3)['scale_upper'],3)
  for pair in [(0,3),(3,1),(None,3),(1,None),(1,181)]:
   with self.assertRaises(ValueError):solve.solve_options(*pair)
 def test_url_validation(self):
  for u in ['http://example.org/a','https://127.0.0.1/a','https://[::1]/a','https://x.local/a','https://u:p@example.org/a']:
   with self.assertRaises(ValueError):solve.public_url(u)
 def test_job_receipt_uses_separate_calibration_and_no_session(self):
  cal={'ra':10,'dec':20,'radius':2,'pixscale':3,'orientation':4,'parity':1,'width_arcsec':100,'height_arcsec':90}
  with patch.object(solve,'request',side_effect=[{'status':'success','original_filename':'a.jpg','session':'secret','objects_in_field':['A']},cal]):r=solve.get_receipt('123')
  self.assertEqual(r['calibration']['width_arcsec'],100);self.assertNotIn('session',r)
 def test_missing_key_no_provider_request(self):
  with patch.dict('os.environ',{},clear=True),patch.object(solve,'request') as call:
   with self.assertRaises(ValueError):solve.login()
   call.assert_not_called()

 def test_key_check_only_logs_authentication_result(self):
  output=io.StringIO()
  with patch.dict('os.environ',{'ASTROMETRY_API_KEY':'test-key-not-real'},clear=True),patch.object(solve,'request',return_value={'status':'success','session':'test-session-not-real'}) as request,patch('sys.argv',['solve.py','--check-key']),contextlib.redirect_stdout(output):
   solve.main()
  self.assertEqual(request.call_count,1)
  self.assertEqual(request.call_args.args[0],'/api/login')
  self.assertEqual(output.getvalue(),'Astrometry API key authenticated. No image submitted.\n')
  self.assertNotIn('test-key-not-real',output.getvalue())
  self.assertNotIn('test-session-not-real',output.getvalue())
