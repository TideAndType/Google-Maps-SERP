'use client';

import { useEffect, useState, useMemo, useCallback, use } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Trophy, List, ChevronLeft, ChevronRight, ExternalLink, MapPin, Layers, Eye, Target, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, Button, Badge, Input } from '@/components/ui';
import { exportToXLSX, exportToPDF } from '@/lib/export';
import { ScanHeader } from '@/components/scans/ScanHeader';
// AIInsights removed as redundant
import { PinInspectionSidebar } from '@/components/scans/PinInspectionSidebar';
import { BusinessCard } from '@/components/scans/BusinessCard';
import { TrendChart } from '@/components/scans/TrendChart';
import { CompetitorIntelligenceDashboard } from '@/components/scans/CompetitorIntelligence';
import { AllListingsTable } from '@/components/scans/AllListingsTable';
import { TimelineBar } from '@/components/scans/TimelineBar';
import { AddressResolver } from '@/components/scans/AddressResolver';

// Dynamically import Map component to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/ui/Map'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center"><p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading Spatial Data...</p></div>
});
const MiniMap = dynamic(() => import('@/components/scans/MiniMap').then(m => m.MiniMap), {
    ssr: false,
    loading: () => <div className="w-24 h-24 bg-gray-100 rounded-lg animate-pulse" />
});

interface Result {
    id: string;
    lat: number;
    lng: number;
    rank: number | null;
    topResults: string; // JSON string
}

interface Scan {
    id: string;
    keyword: string;
    status: string;
    gridSize: number;
    radius: number;
    frequency: string;
    createdAt: string;
    centerLat: number;
    centerLng: number;
    businessName?: string;
    placeId?: string;
    customPoints?: string; // JSON string
    results: Result[];
}

interface Run {
    runId: string;
    runAt: string;
    resultCount: number;
}

interface RankedBusiness {
    name: string;
    rank: number;
    url?: string;
    address?: string;
    rating?: number;
    reviews?: number;
}

export default function ScanReportPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const [scan, setScan] = useState<Scan | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'map' | 'list' | 'listings' | 'intelligence'>('map');
    const [selectedPoint, setSelectedPoint] = useState<Result | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'top3' | 'top10' | 'unranked'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sharing, setSharing] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [runs, setRuns] = useState<Run[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [enlargedMap, setEnlargedMap] = useState<{ lat: number, lng: number, rank: number | null | undefined } | null>(null);

    const fetchScan = useCallback((runId?: string) => {
        const url = runId
            ? `/api/scans/${resolvedParams.id}?runId=${runId}`
            : `/api/scans/${resolvedParams.id}`;
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                setScan(data.scan);
                if (data.runs) setRuns(data.runs);
                if (data.activeRunId) setActiveRunId(data.activeRunId);
            })
            .catch(err => {
                console.error('Scan fetch error:', err);
            })
            .finally(() => setLoading(false));
    }, [resolvedParams.id]);

    useEffect(() => {
        fetchScan();
    }, [resolvedParams.id]);

    useEffect(() => {
        if (scan?.status !== 'RUNNING' && scan?.status !== 'PENDING') return;

        const interval = setInterval(() => {
            fetchScan(activeRunId || undefined);
        }, 5000);

        return () => clearInterval(interval);
    }, [resolvedParams.id, scan?.status, activeRunId]);

    const handleSelectRun = (runId: string) => {
        setActiveRunId(runId);
        setLoading(true);
        fetchScan(runId);
    };

    // CTR model based on industry benchmarks for local pack rankings
    const getCTR = (rank: number | null): number => {
        if (!rank) return 0;
        const ctrByRank: { [key: number]: number } = {
            1: 0.325, 2: 0.175, 3: 0.115,
            4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
            11: 0.005, 12: 0.005, 13: 0.005, 14: 0.005, 15: 0.005,
            16: 0.005, 17: 0.005, 18: 0.005, 19: 0.005, 20: 0.005
        };
        return ctrByRank[Math.min(rank, 20)] || 0;
    };

    const getTopResults = (jsonStr: string): RankedBusiness[] => {
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            return [];
        }
    };

    // All hooks must be called before any early returns (Rules of Hooks)
    const totalPoints = useMemo(() => {
        if (!scan) return 0;
        if (scan.customPoints) {
            try {
                const points = JSON.parse(scan.customPoints);
                if (Array.isArray(points)) return points.length;
            } catch { /* invalid JSON */ }
        }
        return scan.gridSize * scan.gridSize;
    }, [scan?.customPoints, scan?.gridSize]);

    const completedPoints = scan?.results.length ?? 0;

    const avgRank = useMemo(() =>
        !scan ? 0 : scan.results.reduce((acc, r) => acc + (r.rank || 20), 0) / (completedPoints || 1),
        [scan?.results, completedPoints]
    );

    const visibilityScore = useMemo(() =>
        !scan || completedPoints === 0
            ? 0
            : (scan.results.reduce((acc, r) => acc + getCTR(r.rank), 0) / completedPoints) * 100,
        [scan?.results, completedPoints]
    );

    const filteredResults = useMemo(() => {
        if (!scan) return [];
        return scan.results.filter(r => {
            if (filter === 'top3') return r.rank && r.rank <= 3;
            if (filter === 'top10') return r.rank && r.rank <= 10;
            if (filter === 'unranked') return !r.rank;
            return true;
        }).filter(r => {
            if (!searchQuery) return true;
            const results = getTopResults(r.topResults);
            return results.some(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
        });
    }, [scan?.results, filter, searchQuery]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <RefreshCw className="animate-spin text-gray-400" />
            </div>
        );
    }

    if (!scan) return <div>Scan not found</div>;

    const toggleRow = (id: string) => {
        const next = new Set(expandedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRows(next);
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) return;
        try {
            const res = await fetch(`/api/scans/${scan.id}`, { method: 'DELETE' });
            if (res.ok) router.push('/scans');
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete scan');
        }
    };

    // --- Competitor Analysis Logic ---
    const competitorsList = (() => {
        const competitorsMap = new Map<string, {
            name: string,
            avgRank: number,
            appearances: number,
            top3: number,
            top10: number,
            url?: string
        }>();

        scan.results.forEach(r => {
            const results = getTopResults(r.topResults);
            results.forEach(biz => {
                const entry = competitorsMap.get(biz.name) || {
                    name: biz.name,
                    avgRank: 0,
                    appearances: 0,
                    top3: 0,
                    top10: 0,
                    url: biz.url
                };
                entry.appearances += 1;
                entry.avgRank += biz.rank;
                if (biz.rank <= 3) entry.top3 += 1;
                if (biz.rank <= 10) entry.top10 += 1;
                competitorsMap.set(biz.name, entry);
            });
        });

        return Array.from(competitorsMap.values())
            .map(c => ({ ...c, avgRank: c.avgRank / c.appearances }))
            .filter(c => c.name.toLowerCase() !== scan.businessName?.toLowerCase())
            .sort((a, b) => b.appearances - a.appearances || a.avgRank - b.avgRank);
    })();

    const top3Competitors = competitorsList.slice(0, 3);
    // --------------------------------

    const handleStop = async () => {
        if (!confirm('Stop this scan? Results collected so far will be saved.')) return;
        try {
            setLoading(true);
            const res = await fetch(`/api/scans/${scan!.id}/stop`, {
                method: 'POST'
            });
            const data = await res.json();

            if (res.ok) {
                setScan(data.scan);
            } else {
                throw new Error(data.details || data.error || 'Failed to stop');
            }
        } catch (error: any) {
            console.error('Stop failed:', error);
            alert(`Stop Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRerun = async () => {
        if (!confirm('Start a new scan run? Previous results will be preserved in the timeline.')) return;
        try {
            setLoading(true);
            const res = await fetch(`/api/scans/${scan.id}/rerun`, {
                method: 'POST'
            });
            const data = await res.json();

            if (res.ok) {
                setScan(data.scan);
            } else {
                throw new Error(data.details || data.error || 'Failed to rerun');
            }
        } catch (error: any) {
            console.error('Rerun failed:', error);
            alert(`Rerun Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExportXLSX = () => {
        if (!scan) return;
        exportToXLSX(scan.keyword, scan.results);
    };

    const handleExportPDF = () => {
        if (!scan) return;
        exportToPDF(scan.keyword, scan.results, scan);
    };

    const handleShare = async () => {
        if (sharing) return;
        const url = window.location.href;

        if (navigator.share) {
            setSharing(true);
            try {
                await navigator.share({
                    title: `GBP Rank Tracker Report: ${scan.keyword}`,
                    text: `Check out the local ranking report for "${scan.keyword}"`,
                    url: url,
                });
            } catch (err: any) {
                if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') {
                    console.error('Error sharing:', err);
                }
                // Fallback to clipboard if it fails or if the user cancels but we want to be helpful
                try {
                    await navigator.clipboard.writeText(url);
                } catch (clipErr) {
                    console.error('Clipboard fallback failed:', clipErr);
                }
            } finally {
                setSharing(false);
            }
        } else {
            try {
                await navigator.clipboard.writeText(url);
                alert('Report link copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy:', err);
                alert('Failed to copy link. Please copy the URL manually.');
            }
        }
    };

    const handleCancelSchedule = async () => {
        if (!confirm('Cancel the recurring schedule? The scan will no longer auto-run.')) return;
        try {
            const res = await fetch(`/api/scans/${scan.id}/cancel-schedule`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setScan((prev: any) => prev ? { ...prev, frequency: 'ONCE', nextRun: null } : prev);
            } else {
                throw new Error(data.error || 'Failed to cancel');
            }
        } catch (error: any) {
            alert(`Failed to cancel schedule: ${error.message}`);
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6">
            <ScanHeader
                scan={scan}
                onStop={handleStop}
                onRerun={handleRerun}
                onDelete={handleDelete}
                onExportXLSX={handleExportXLSX}
                onExportPDF={handleExportPDF}
                onShare={handleShare}
                onCancelSchedule={scan.frequency !== 'ONCE' ? handleCancelSchedule : undefined}
            />

            {/* Timeline Bar - shows when 2+ runs exist */}
            <TimelineBar
                runs={runs}
                activeRunId={activeRunId}
                onSelectRun={handleSelectRun}
            />

            {/* Visibility Score Card */}
            {scan.businessName && completedPoints > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest opacity-80">Visibility Score</h3>
                            <Eye size={18} className="opacity-60" />
                        </div>
                        <p className="text-4xl font-black">{visibilityScore.toFixed(1)}%</p>
                        <p className="text-xs opacity-70 mt-1">
                            {visibilityScore >= 20 ? 'Excellent visibility' :
                                visibilityScore >= 10 ? 'Good visibility' :
                                    visibilityScore >= 5 ? 'Average visibility' : 'Needs improvement'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Average Rank</h3>
                            <Target size={18} className="text-gray-400" />
                        </div>
                        <p className="text-4xl font-black text-gray-900">#{avgRank.toFixed(1)}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {avgRank <= 3 ? 'Top 3 performer' :
                                avgRank <= 10 ? 'Page 1 average' : 'Below fold'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Scan Progress</h3>
                            <MapPin size={18} className="text-gray-400" />
                        </div>
                        <p className="text-4xl font-black text-gray-900">{completedPoints}/{totalPoints}</p>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                            <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${(completedPoints / totalPoints) * 100}%` }}
                            />
                        </div>
                    </Card>
                </div>
            )}

            {/* Competitor Performance Analytics */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                        <Trophy size={18} className="text-blue-600" />
                        Top Listings Detected
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('listings')} className="text-blue-600 font-bold text-xs uppercase tracking-wider">
                        View All Contributions
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {top3Competitors.map((comp, idx) => (
                        <Card key={comp.name} className="p-4 border-l-4 border-l-blue-500 hover:shadow-lg transition-all">
                            <div className="flex justify-between items-start mb-3">
                                <div className="bg-blue-50 text-blue-600 font-black text-[10px] px-2 py-1 rounded uppercase">Rank #{idx + 1} Share</div>
                                <span className="text-[10px] text-gray-400 font-mono">Found in {comp.appearances} points</span>
                            </div>
                            <h4 className="font-bold text-gray-900 truncate mb-2">{comp.name}</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 p-2 rounded-lg">
                                    <p className="text-[9px] text-gray-400 uppercase font-bold">Avg Rank</p>
                                    <p className="text-sm font-black text-gray-900">#{comp.avgRank.toFixed(1)}</p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded-lg">
                                    <p className="text-[9px] text-gray-400 uppercase font-bold">Top 3 Hits</p>
                                    <p className="text-sm font-black text-emerald-600">{comp.top3}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>



            {/* Historical Trend Chart - Only show if business is being tracked */}
            {scan.businessName && (
                <TrendChart
                    keyword={scan.keyword}
                    businessName={scan.businessName}
                    currentScanId={scan.id}
                />
            )}

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Map/List View */}
                <div className="lg:col-span-3">
                    <Card noPadding className="overflow-hidden h-[85vh] flex flex-col border-none shadow-xl ring-1 ring-gray-200">
                        {/* Toolkit Bar */}
                        <div className="p-3 border-b border-gray-100 bg-white flex justify-between items-center z-10">
                            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveTab('map')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    Spatial View
                                </button>
                                <button
                                    onClick={() => setActiveTab('list')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    Grid Status
                                </button>
                                <button
                                    onClick={() => setActiveTab('listings')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'listings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    All Listings
                                </button>
                                <button
                                    onClick={() => setActiveTab('intelligence')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${activeTab === 'intelligence' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <Trophy size={12} />
                                    Intelligence
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                {activeTab === 'listings' ? (
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">All Listings Analysis</span>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Input
                                                placeholder="Search business..."
                                                className="h-8 w-48 text-xs pl-8 bg-gray-50 border-gray-100"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                            <List className="absolute left-2.5 top-2 text-gray-400" size={12} />
                                        </div>
                                        <select
                                            className="text-xs font-bold bg-gray-50 border border-gray-100 rounded-md h-8 px-2 outline-none focus:ring-1 focus:ring-blue-500"
                                            value={filter}
                                            onChange={(e) => setFilter(e.target.value as any)}
                                        >
                                            <option value="all">All Ranks</option>
                                            <option value="top3">Top 3 Only</option>
                                            <option value="top10">Top 10 Only</option>
                                            <option value="unranked">Unranked</option>
                                        </select>
                                        <button
                                            onClick={() => setShowHeatmap(!showHeatmap)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${showHeatmap ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            title="Toggle Heatmap Layer"
                                        >
                                            <Layers size={12} />
                                            Heatmap
                                        </button>
                                    </>
                                )}
                                <span className="text-[10px] text-gray-400 font-mono tracking-tighter uppercase font-bold">Progress: {completedPoints}/{totalPoints}</span>
                            </div>
                        </div>

                        <div className="flex-1 relative bg-gray-50 overflow-hidden">
                            {activeTab === 'map' ? (
                                <MapComponent
                                    center={[scan.centerLat, scan.centerLng]}
                                    zoom={13}
                                    points={scan.results.map(r => ({ ...r, hasData: true, hasTarget: Boolean(scan.businessName || scan.placeId) })) || []}
                                    gridSize={scan.gridSize}
                                    onPointClick={(point) => setSelectedPoint(point as unknown as Result)}
                                    showHeatmap={showHeatmap}
                                />
                            ) : activeTab === 'list' ? (
                                <div className="h-full bg-white overflow-y-auto custom-scrollbar">
                                    <div className="divide-y divide-gray-100">
                                        {filteredResults.map((r) => {
                                            const isExpanded = expandedRows.has(r.id);
                                            const topResults = getTopResults(r.topResults);
                                            return (
                                                <div key={r.id} className="transition-all">
                                                    <div
                                                        onClick={() => toggleRow(r.id)}
                                                        className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/20 shadow-inner' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-6 flex-1">
                                                            {/* Mini Map */}
                                                            <div className="shrink-0">
                                                                <MiniMap
                                                                    lat={r.lat}
                                                                    lng={r.lng}
                                                                    rank={r.rank}
                                                                    onEnlarge={(_lat, _lng, _rank) => setEnlargedMap({ lat: _lat, lng: _lng, rank: _rank })}
                                                                />
                                                            </div>

                                                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                                                                <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Grid Anchor</span>
                                                                <span className="text-xs font-bold text-gray-600 font-mono tracking-tight">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</span>
                                                                <AddressResolver lat={r.lat} lng={r.lng} />
                                                            </div>
                                                            <div className="flex flex-col items-center flex-1">
                                                                <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Positional Rank</span>
                                                                {r.rank ? (
                                                                    <Badge variant={r.rank <= 3 ? 'success' : r.rank <= 10 ? 'warning' : 'destructive'} className="h-5 font-black text-[10px]">
                                                                        #{r.rank}
                                                                    </Badge>
                                                                ) : scan.businessName ? (
                                                                    <Badge variant="destructive" className="h-5 text-[10px] font-bold">Not Found</Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="h-5 text-[10px] font-bold text-gray-400">Quick Scan</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Local Entities</span>
                                                                <span className="text-xs font-bold text-gray-800">{topResults.length} Listings</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-1.5 rounded-full transition-all ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                                                {isExpanded ? <ChevronLeft className="rotate-90" size={12} /> : <ChevronRight size={12} />}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="bg-gray-50/80 p-5 ml-4 mb-3 mr-4 rounded-b-2xl border-x border-b border-gray-100 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                {topResults.map((biz) => (
                                                                    <BusinessCard
                                                                        key={`${biz.name}-${biz.rank}`}
                                                                        biz={biz}
                                                                        scan={scan}
                                                                        compact={true}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : activeTab === 'listings' ? (
                                <AllListingsTable
                                    results={scan.results}
                                    totalPoints={totalPoints}
                                    targetBusinessName={scan.businessName}
                                />
                            ) : activeTab === 'intelligence' ? (
                                <div className="h-full bg-gray-50 overflow-y-auto p-4">
                                    <CompetitorIntelligenceDashboard
                                        results={scan.results}
                                        targetBusinessName={scan.businessName}
                                        totalPoints={totalPoints}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </Card>
                </div>

                {/* Enlarged Map Modal */}
                {enlargedMap && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
                        onClick={() => setEnlargedMap(null)}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-2xl h-[600px] flex flex-col relative animate-in zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setEnlargedMap(null)}
                                className="absolute -top-4 -right-4 bg-white text-gray-600 hover:text-red-500 rounded-full p-2 shadow-lg z-10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <div className="mb-4">
                                <h3 className="font-black text-gray-900 uppercase tracking-widest">Grid Anchor Detail</h3>
                                <div className="mt-1">
                                    <AddressResolver lat={enlargedMap.lat} lng={enlargedMap.lng} />
                                </div>
                            </div>
                            <div className="flex-1 rounded-xl overflow-hidden ring-1 ring-gray-100">
                                {/* We reuse the Main Map component but with only 1 point */}
                                <MapComponent
                                    center={[enlargedMap.lat, enlargedMap.lng]}
                                    zoom={18}
                                    points={[{
                                        id: 'enlarged',
                                        lat: enlargedMap.lat,
                                        lng: enlargedMap.lng,
                                        rank: enlargedMap.rank as any,
                                        hasData: true
                                    }]}
                                    gridSize={3} // Doesn't matter, grid hides when looking at 1 point
                                    showHeatmap={false}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Dynamic Sidebar: Results Inspection */}
                <PinInspectionSidebar selectedPoint={selectedPoint} getTopResults={getTopResults} scan={scan} />
            </div>
        </div>
    );
}
