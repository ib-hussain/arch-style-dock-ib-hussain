import subprocess
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from install import atomic_install, activate, UUID, CONFLICTS
from restore import restore_files


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.stage = self.root / 'stage'
        self.stage.mkdir()
        (self.stage / 'extension.js').write_text('new')
        self.target = self.root / 'installed'
        self.backup = self.root / 'backup'
        self.backup.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_directory_is_backed_up_before_replacement(self):
        self.target.mkdir()
        (self.target / 'extension.js').write_text('old')
        atomic_install(self.stage, self.target, self.backup)
        self.assertEqual((self.target / 'extension.js').read_text(), 'new')
        self.assertEqual((self.backup / 'extension/extension.js').read_text(), 'old')

    def test_symlink_target_repository_is_untouched(self):
        repo = self.root / 'external-repository'
        repo.mkdir()
        (repo / 'extension.js').write_text('keep')
        self.target.symlink_to(repo, target_is_directory=True)
        atomic_install(self.stage, self.target, self.backup)
        self.assertEqual((repo / 'extension.js').read_text(), 'keep')
        self.assertTrue((self.backup / 'extension').is_symlink())
        self.assertFalse(self.target.is_symlink())

    def test_failed_replacement_restores_previous_installation(self):
        self.target.mkdir()
        (self.target / 'extension.js').write_text('old')
        with patch('install.os.replace', side_effect=OSError('injected failure')):
            with self.assertRaises(OSError):
                atomic_install(self.stage, self.target, self.backup)
        self.assertEqual((self.target / 'extension.js').read_text(), 'old')
        self.assertTrue(self.stage.is_dir())

    def test_rollback_restores_original_directory_and_keeps_new_files(self):
        self.target.mkdir()
        (self.target / 'extension.js').write_text('old')
        atomic_install(self.stage, self.target, self.backup)
        displaced = self.backup / 'new-copy'
        restore_files(self.target, self.backup, True, displaced)
        self.assertEqual((self.target / 'extension.js').read_text(), 'old')
        self.assertEqual((displaced / 'extension.js').read_text(), 'new')

    def test_relative_symlink_is_restored_without_writing_its_repository(self):
        repo = self.root / 'external'
        repo.mkdir()
        (repo / 'extension.js').write_text('keep')
        self.target.symlink_to('external', target_is_directory=True)
        atomic_install(self.stage, self.target, self.backup)
        restore_files(self.target, self.backup, True, self.backup / 'new-copy')
        self.assertTrue(self.target.is_symlink())
        self.assertEqual((self.target / 'extension.js').read_text(), 'keep')
        self.assertEqual((repo / 'extension.js').read_text(), 'keep')

    def test_rollback_of_first_installation_removes_only_new_entry(self):
        atomic_install(self.stage, self.target, self.backup)
        displaced = self.backup / 'new-copy'
        restore_files(self.target, self.backup, False, displaced)
        self.assertFalse(self.target.exists())
        self.assertEqual((displaced / 'extension.js').read_text(), 'new')

    def test_failed_rollback_puts_current_installation_back(self):
        self.target.mkdir()
        (self.target / 'extension.js').write_text('old')
        atomic_install(self.stage, self.target, self.backup)
        original = Path.rename

        def rename(path, dest):
            if path == self.backup / 'extension':
                raise OSError('injected restore failure')
            return original(path, dest)

        with patch.object(Path, 'rename', rename):
            with self.assertRaises(OSError):
                restore_files(self.target, self.backup, True, self.backup / 'new-copy')
        self.assertEqual((self.target / 'extension.js').read_text(), 'new')
        self.assertEqual((self.backup / 'extension/extension.js').read_text(), 'old')


class ActivationTests(unittest.TestCase):
    def selection(self, failure=None):
        enabled = {CONFLICTS[0], CONFLICTS[1], 'unrelated@example.com'}
        before = enabled.copy()

        def run(args, **kwargs):
            action, uuid = args[1:]
            if (action, uuid) == failure:
                raise subprocess.CalledProcessError(1, args, stderr='injected activation failure')
            if action == 'enable':
                enabled.add(uuid)
            else:
                enabled.discard(uuid)
            return subprocess.CompletedProcess(args, 0, '', '')

        with patch('install.subprocess.check_output', return_value='\n'.join(enabled)), \
             patch('install.subprocess.run', side_effect=run), patch('builtins.print'):
            success = activate()
        return success, before, enabled

    def test_success_preserves_unrelated_extensions(self):
        success, before, enabled = self.selection()
        self.assertTrue(success)
        self.assertEqual(enabled, {'unrelated@example.com', UUID})

    def test_enable_failure_restores_previous_dock_selection(self):
        success, before, enabled = self.selection(('enable', UUID))
        self.assertFalse(success)
        self.assertEqual(enabled, before)

    def test_failure_while_disabling_conflicts_restores_partial_changes(self):
        success, before, enabled = self.selection(('disable', CONFLICTS[1]))
        self.assertFalse(success)
        self.assertEqual(enabled, before)


if __name__ == '__main__':
    unittest.main()
