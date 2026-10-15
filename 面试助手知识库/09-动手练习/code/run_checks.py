"""Run local teaching examples; all build/database outputs are temporary."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent
env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1')
with tempfile.TemporaryDirectory(prefix='interview-exercises-') as directory:
    binary=Path(directory)/'test_cpp'
    subprocess.run(['clang++','-std=c++17','-Wall','-Wextra','-Werror',
                    '-pthread',str(ROOT/'test_cpp.cpp'),'-o',str(binary)],check=True,timeout=30)
    for group in ['ring','parser','queue']:
        subprocess.run([str(binary),group],check=True,timeout=15)
subprocess.run([sys.executable,'-m','unittest','-v','test_python'],
               cwd=ROOT,env=env,check=True,timeout=30)
print('ALL CHECKS PASSED')
