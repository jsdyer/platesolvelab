import importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('build_adapter',ROOT/'scripts/build_adapter.py');bundle=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(bundle)
class AdapterBundleTests(unittest.TestCase):
 def test_dashboard_file_matches_source_and_is_self_contained(self):
  generated=bundle.source()
  self.assertEqual((ROOT/'adapter/worker-dashboard.mjs').read_text(),generated)
  self.assertNotRegex(generated,r'(?m)^import\s')
  self.assertIn('export default',generated)
  self.assertIn('OWNER_PAGE',generated)
