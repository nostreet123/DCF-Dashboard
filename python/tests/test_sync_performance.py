from __future__ import annotations

import time
import hashlib
import pytest
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from unittest.mock import Mock, patch, MagicMock
import pandas as pd

from damodaran_sync.sync import sync_dataset_at_url, _is_batch_too_large_error
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.discover import Asset
from damodaran_sync.excel_parse import ParsedTable
from damodaran_sync.transform import TransformedTable, TransformedRow


@dataclass
class TimingResult:
    discovery_ms: float
    download_ms: float
    parse_ms: float
    transform_ms: float
    resolve_ms: float
    upsert_ms: float
    insert_ms: float
    cleanup_ms: float
    total_ms: float
    row_count: int


class MockConvexSyncClient:
    def __init__(self, url: str, sync_token: str):
        self.url = url
        self.sync_token = sync_token
        self.timing_logs: List[Dict[str, Any]] = []
        self.stage_start_times: Dict[str, float] = {}
        
    def _log_stage_timing(self, stage: str, duration_ms: float) -> None:
        self.timing_logs.append({
            "stage": stage,
            "duration_ms": duration_ms,
            "timestamp": time.time()
        })
    
    def start_sync(self, asset_url: str) -> Dict[str, Any]:
        self.stage_start_times['sync_start'] = time.time()
        return {
            "syncLogId": "test-sync-123",
            "datasets": [
                {"key": "test_dataset", "name": "Test Dataset"}
            ],
            "datasetMappings": [
                {"pattern": "test", "datasetKey": "test_dataset", "isRegex": False}
            ],
            "regions": [
                {"code": "us", "fileTokens": ["us", "usa"]}
            ]
        }
    
    def finish_sync(self, sync_log_id: str, status: str, total_duration_ms: float) -> None:
        if 'sync_start' in self.stage_start_times:
            duration = (time.time() - self.stage_start_times['sync_start']) * 1000
            self.timing_logs.append({
                "stage": "total_sync",
                "duration_ms": duration,
                "status": status
            })
    
    def create_snapshot(self, sync_log_id: str, asset_url: str, 
                       dataset_key: str, region_code: str, 
                       as_of_date: str, asset_hash: str, 
                       transformed: TransformedTable) -> Optional[str]:
        start = time.time()
        snapshot_id = f"snapshot-{hashlib.md5(asset_url.encode()).hexdigest()[:8]}"
        self._log_stage_timing("upsert_snapshot", (time.time() - start) * 1000)
        return snapshot_id
    
    def insert_rows(self, snapshot_id: str, rows: List[TransformedRow], 
                   batch_size: int = 100) -> None:
        start = time.time()
        total_rows = len(rows)
        batches = (total_rows + batch_size - 1) // batch_size
        
        for i in range(0, total_rows, batch_size):
            batch_num = i // batch_size + 1
            self.timing_logs.append({
                "stage": f"insert_batch_{batch_num}",
                "duration_ms": 10.0,
                "rows": len(rows[i:i+batch_size])
            })
        
        self._log_stage_timing("insert_rows", (time.time() - start) * 1000)
    
    def cleanup_nonactive_tabledata(self) -> int:
        start = time.time()
        self._log_stage_timing("cleanup", (time.time() - start) * 1000)
        return 0
    
    def add_sync_error(self, sync_log_id: str, error_type: str, 
                      message: str, context: Dict[str, Any]) -> None:
        self.timing_logs.append({
            "stage": "error",
            "error_type": error_type,
            "message": message,
            "context": context
        })


class MockDownloader:
    def __init__(self):
        self.download_times: List[float] = []
        
    def download(self, url: str, filepath: str) -> None:
        start = time.time()
        time.sleep(0.01)
        self.download_times.append((time.time() - start) * 1000)


class MockExcelParser:
    def __init__(self, row_count: int = 100):
        self.row_count = row_count
        self.parse_times: List[float] = []
        
    def parse(self, filepath: str) -> ParsedTable:
        start = time.time()
        time.sleep(0.005)
        
        if "invalid" in filepath:
            raise ValueError("Invalid Excel file")
        
        rows = [
            [f"Industry_{i}", "US", float(i * 1.5)]
            for i in range(self.row_count)
        ]
        
        self.parse_times.append((time.time() - start) * 1000)
        
        return ParsedTable(
            sheet_name="Sheet1",
            header_row=0,
            column_names=["Industry", "Region", "Value"],
            rows=rows,
            row_count=self.row_count,
            sheet_candidates=["Sheet1"],
            skipped_sheets=[]
        )


class MockDiscovery:
    def __init__(self, asset_count: int = 5):
        self.asset_count = asset_count
        self.discover_times: List[float] = []
        
    def discover_current(self) -> List[Asset]:
        start = time.time()
        time.sleep(0.01)
        
        assets = []
        for i in range(self.asset_count):
            assets.append(Asset(
                url=f"https://example.com/data{i}.xls",
                name=f"dataset_{i}.xls",
                label=f"Dataset {i}"
            ))
        
        self.discover_times.append((time.time() - start) * 1000)
        return assets


def create_mock_asset(row_count: int = 100) -> Asset:
    return Asset(
        url="https://pages.stern.nyu.edu/~adamodar/pc/datasets/test_dataset.xls",
        name="test_dataset.xls",
        label="Test Dataset"
    )


@pytest.fixture
def timing_tracker():
    tracker = {}
    return tracker


@pytest.fixture
def mock_convex_client():
    return MockConvexSyncClient("http://test", "test-token")


@pytest.fixture
def mock_downloader():
    return MockDownloader()


@pytest.fixture
def mock_parser():
    return MockExcelParser(row_count=100)


@pytest.fixture
def mock_discovery():
    return MockDiscovery(asset_count=1)


def test_sync_small_dataset_performance(mock_convex_client, mock_downloader, 
                                       mock_parser, mock_discovery, timing_tracker):
    """Test sync performance with small dataset (100 rows)"""
    total_start = time.time()
    
    asset = create_mock_asset(row_count=100)
    
    with patch('damodaran_sync.sync.ConvexSyncClient', return_value=mock_convex_client):
        with patch('damodaran_sync.download.Downloader', return_value=mock_downloader):
            with patch('damodaran_sync.excel_parse.ExcelParser', return_value=mock_parser):
                result = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=True,
                    cleanup=True
                )
    
    total_duration = (time.time() - total_start) * 1000
    
    assert result is True
    assert len(mock_convex_client.timing_logs) > 0
    
    insert_logs = [log for log in mock_convex_client.timing_logs 
                   if log['stage'] == 'insert_rows']
    assert len(insert_logs) == 1
    assert insert_logs[0]['duration_ms'] < 100


def test_sync_medium_dataset_performance(mock_convex_client, mock_downloader, 
                                       timing_tracker):
    """Test sync performance with medium dataset (1000 rows)"""
    parser = MockExcelParser(row_count=1000)
    asset = create_mock_asset(row_count=1000)
    
    total_start = time.time()
    
    with patch('damodaran_sync.sync.ConvexSyncClient', return_value=mock_convex_client):
        with patch('damodaran_sync.download.Downloader', return_value=mock_downloader):
            with patch('damodaran_sync.excel_parse.ExcelParser', return_value=parser):
                result = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=True,
                    cleanup=False
                )
    
    total_duration = (time.time() - total_start) * 1000
    
    assert result is True
    
    batch_logs = [log for log in mock_convex_client.timing_logs 
                  if 'batch' in log['stage']]
    assert len(batch_logs) == 10
    
    insert_logs = [log for log in mock_convex_client.timing_logs 
                   if log['stage'] == 'insert_rows']
    assert insert_logs[0]['duration_ms'] < 200


def test_sync_large_dataset_performance(mock_convex_client, mock_downloader, 
                                       timing_tracker):
    """Test sync performance with large dataset (5000 rows)"""
    parser = MockExcelParser(row_count=5000)
    asset = create_mock_asset(row_count=5000)
    
    total_start = time.time()
    
    with patch('damodaran_sync.sync.ConvexSyncClient', return_value=mock_convex_client):
        with patch('damodaran_sync.download.Downloader', return_value=mock_downloader):
            with patch('damodaran_sync.excel_parse.ExcelParser', return_value=parser):
                result = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=True,
                    cleanup=True
                )
    
    total_duration = (time.time() - total_start) * 1000
    
    assert result is True
    assert total_duration < 5000
    
    batch_logs = [log for log in mock_convex_client.timing_logs 
                  if 'batch' in log['stage']]
    assert len(batch_logs) == 50


def test_sync_with_cache_hit(mock_convex_client, mock_downloader, mock_parser):
    """Test sync when data hasn't changed (cache hit)"""
    asset = create_mock_asset(row_count=100)
    
    total_start = time.time()
    
    with patch('damodaran_sync.sync.ConvexSyncClient', return_value=mock_convex_client):
        with patch('damodaran_sync.download.Downloader', return_value=mock_downloader):
            with patch('damodaran_sync.excel_parse.ExcelParser', return_value=mock_parser):
                result1 = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=False,
                    cleanup=False
                )
                
                duration1 = (time.time() - total_start) * 1000
                
                total_start = time.time()
                result2 = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=False,
                    cleanup=False
                )
                duration2 = (time.time() - total_start) * 1000
    
    assert result1 is True
    assert result2 is True
    assert duration2 < duration1 * 0.3


def test_sync_error_recovery_performance(mock_convex_client, mock_downloader):
    """Test sync performance with error recovery"""
    parser = MockExcelParser(row_count=100)
    
    original_parse = parser.parse
    
    def failing_parse(filepath: str) -> ParsedTable:
        if "fail" in filepath:
            raise ValueError("Simulated parse error")
        return original_parse(filepath)
    
    parser.parse = failing_parse
    
    asset = Asset(
        url="https://pages.stern.nyu.edu/~adamodar/pc/datasets/fail_dataset.xls",
        name="fail_dataset.xls",
        label="Fail Dataset"
    )
    
    total_start = time.time()
    
    with patch('damodaran_sync.sync.ConvexSyncClient', return_value=mock_convex_client):
        with patch('damodaran_sync.download.Downloader', return_value=mock_downloader):
            with patch('damodaran_sync.excel_parse.ExcelParser', return_value=parser):
                result = sync_dataset_at_url(
                    asset_url=asset.url,
                    sync_client=mock_convex_client,
                    force=True,
                    cleanup=False
                )
    
    total_duration = (time.time() - total_start) * 1000
    
    assert result is False
    
    error_logs = [log for log in mock_convex_client.timing_logs 
                  if log['stage'] == 'error']
    assert len(error_logs) > 0
    assert error_logs[0]['error_type'] == 'excel_parse'


def test_batch_insert_performance_scaling():
    """Test that batch insertion scales linearly with row count"""
    client = MockConvexSyncClient("http://test", "token")
    
    for row_count in [100, 500, 1000, 2000]:
        snapshot_id = f"snapshot-{row_count}"
        rows = [
            TransformedRow(
                primary_key=f"key_{i}",
                secondary_key="US",
                metrics={"value": float(i)}
            )
            for i in range(row_count)
        ]
        
        start = time.time()
        client.insert_rows(snapshot_id, rows, batch_size=100)
        duration = (time.time() - start) * 1000
        
        expected_batches = (row_count + 99) // 100
        assert duration < expected_batches * 15


def test_discovery_performance_scaling():
    """Test discovery performance with different asset counts"""
    for asset_count in [1, 5, 10, 20]:
        discovery = MockDiscovery(asset_count=asset_count)
        
        start = time.time()
        assets = discovery.discover_current()
        duration = (time.time() - start) * 1000
        
        assert len(assets) == asset_count
        assert duration < 50


def test_download_performance():
    """Test download performance metrics"""
    downloader = MockDownloader()
    
    test_urls = [
        "http://example.com/small.xls",
        "http://example.com/medium.xls", 
        "http://example.com/large.xls"
    ]
    
    for url in test_urls:
        downloader.download(url, f"/tmp/{url.split('/')[-1]}")
    
    assert len(downloader.download_times) == 3
    for duration in downloader.download_times:
        assert duration < 50


def test_is_batch_too_large_error_checks_context() -> None:
    try:
        try:
            raise ValueError("Batch too large: payload")
        except ValueError:
            raise RuntimeError("wrapper")
    except RuntimeError as exc:
        assert _is_batch_too_large_error(exc) is True
