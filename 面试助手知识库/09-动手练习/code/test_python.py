import asyncio
import bisect
import random
import tempfile
import unittest
from pathlib import Path
from solutions import frequencies, lower_bound, bounded_map
from sql_demo import run_demo


class AlgorithmTests(unittest.TestCase):
    def test_frequency(self):
        self.assertEqual(frequencies([3,1,3,2,1]), {3:2,1:2,2:1})
        self.assertEqual(frequencies([]), {})

    def test_lower_bound_edges(self):
        for values in [[],[1],[1,1,2,4]]:
            for target in [-1,0,1,2,3,4,5]:
                self.assertEqual(lower_bound(values,target),bisect.bisect_left(values,target))

    def test_lower_bound_random(self):
        rng=random.Random(23)
        for _ in range(200):
            values=sorted(rng.randrange(-20,20) for _ in range(rng.randrange(40)))
            target=rng.randrange(-30,30)
            self.assertEqual(lower_bound(values,target),bisect.bisect_left(values,target))


class BatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_order_concurrency_and_partial_failure(self):
        active=peak=0
        async def job(x):
            nonlocal active,peak
            active+=1; peak=max(peak,active)
            try:
                await asyncio.sleep(0.001*(5-x))
                if x==2: raise ValueError('example error')
                return x*2
            finally: active-=1
        result=await bounded_map(job,list(range(5)),limit=2,timeout=1)
        self.assertEqual(len(result),5)
        self.assertEqual([x['value'] for x in result if x['ok']], [0,2,6,8])
        self.assertEqual(result[2]['error'],'ValueError')
        self.assertLessEqual(peak,2); self.assertEqual(active,0)

    async def test_timeout_cleans_up(self):
        active=0
        async def job(x):
            nonlocal active
            active+=1
            try:
                if x==0: await asyncio.Event().wait()
                return x
            finally: active-=1
        result=await bounded_map(job,[0,1],limit=1,timeout=0.02)
        self.assertEqual(result[0],{'ok':False,'error':'timeout'})
        self.assertEqual(result[1],{'ok':True,'value':1})
        self.assertEqual(active,0)

    async def test_parent_cancellation_cleans_workers(self):
        started=asyncio.Event(); finished=[]
        async def job(x):
            started.set()
            try: await asyncio.Event().wait()
            finally: finished.append(x)
        before=asyncio.all_tasks()
        task=asyncio.create_task(bounded_map(job,list(range(20)),limit=2,timeout=10))
        await asyncio.wait_for(started.wait(),1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertTrue(finished)
        self.assertFalse([t for t in asyncio.all_tasks()-before if not t.done()])

    async def test_invalid_and_empty(self):
        async def job(x): return x
        for limit,timeout in [(0,1),(-1,1),(1,0),(1,-1)]:
            with self.assertRaises(ValueError):
                await bounded_map(job,[1],limit=limit,timeout=timeout)
        self.assertEqual(await bounded_map(job,[],limit=2,timeout=1),[])

    async def test_child_cancellation_propagates(self):
        async def job(x):
            if x==0: raise asyncio.CancelledError()
            await asyncio.Event().wait()
        before=asyncio.all_tasks()
        with self.assertRaises(asyncio.CancelledError):
            await bounded_map(job,[0,1],limit=2,timeout=1)
        self.assertFalse([t for t in asyncio.all_tasks()-before if not t.done()])


class SqlTests(unittest.TestCase):
    def test_queries_and_index(self):
        with tempfile.TemporaryDirectory() as directory:
            result=run_demo(Path(directory)/'exercise.db')
        self.assertEqual(result.get('totals'),[(1,150),(2,0),(3,70)])
        self.assertEqual(result.get('page'),[(2,50)])
        self.assertIn('ix_orders_lookup',' '.join(result.get('plan',[])))

    def test_competing_writers_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            result=run_demo(Path(directory)/'exercise.db')
        self.assertTrue(result.get('second_writer_blocked'))
        self.assertEqual(result.get('second_purchase_rows'),0)
        self.assertEqual(result.get('stock_after_rollback'),0)


if __name__=='__main__': unittest.main()
