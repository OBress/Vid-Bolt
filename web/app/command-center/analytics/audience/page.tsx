"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Globe2,
  Smartphone,
  MonitorSmartphone,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import ChannelSelector from "@/components/features/analytics/ChannelSelector";

interface Channel {
  id: string;
  channel_title: string;
}

interface Demographics {
  age_gender_data: Record<string, Record<string, number>>;
  country_data: Record<string, number>;
  device_data: Record<string, number>;
  traffic_data: Record<string, number>;
}

const COLORS = [
  '#3b82f6',
  '#ec4899',
  '#a855f7',
  '#eab308',
  '#22c55e',
  '#f97316',
  '#0284c7',
  '#7c3aed',
];

export default function AudiencePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChannels() {
      const res = await fetch("/api/analytics/channels");
      const data = await res.json();
      setChannels(data.channels || []);
      // Auto-select only when exactly 1 channel
      if (data.channels?.length === 1) setSelectedChannelId(data.channels[0].id);
    }
    fetchChannels();
  }, []);

  const fetchDemographics = useCallback(async () => {
    const chId = selectedChannelId || 'all';
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/channels/${chId}/demographics`);
      if (res.ok) {
        const data = await res.json();
        setDemographics(data.demographics);
      }
    } catch (err) {
      console.error("Failed to fetch demographics:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId]);

  useEffect(() => {
    fetchDemographics();
  }, [fetchDemographics]);

  // Transform age/gender data for chart
  const ageGenderChart = demographics?.age_gender_data
    ? Object.entries(demographics.age_gender_data).map(([ageGroup, genders]) => ({
        ageGroup,
        male: genders.male || 0,
        female: genders.female || 0,
        other: genders.user_specified || 0,
      }))
    : [];

  // Transform country data for chart (top 10)
  const countryChart = demographics?.country_data
    ? Object.entries(demographics.country_data)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([country, views]) => ({ country, views }))
    : [];

  // Transform device data for pie chart
  const deviceChart = demographics?.device_data
    ? Object.entries(demographics.device_data).map(([device, views]) => ({ device, views }))
    : [];

  // Transform traffic data for pie chart
  const trafficChart = demographics?.traffic_data
    ? Object.entries(demographics.traffic_data)
        .sort(([, a], [, b]) => b - a)
        .map(([source, views]) => ({ source, views }))
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Audience Analytics</h2>
              <p className="text-sm text-muted-foreground">
                Demographics, geography, devices, and traffic sources.
              </p>
            </div>
          </div>
          <ChannelSelector
            channels={channels}
            selectedId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 max-w-[1600px] w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !demographics ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No audience data yet</p>
            <p className="text-sm mt-1">
              Demographics sync runs weekly. Check back after the first sync.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Age / Gender */}
            {ageGenderChart.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Age & Gender
                </h4>
              <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageGenderChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
                      <XAxis dataKey="ageGroup" tick={{ fontSize: 11, fill: '#a3a3a3' }} stroke="#444" />
                      <YAxis tick={{ fontSize: 11, fill: '#a3a3a3' }} stroke="#444" tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c1c1c',
                          border: '1px solid #444',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                          color: '#fafafa',
                        }}
                        labelStyle={{ color: '#a3a3a3' }}
                        formatter={(value?: string | number) => [`${Number(value ?? 0).toFixed(1)}%`, ""]}
                      />
                      <Legend wrapperStyle={{ color: '#a3a3a3' }} />
                      <Bar dataKey="male" name="Male" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="female" name="Female" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top Countries */}
            {countryChart.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-primary" /> Top Countries
                </h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={countryChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#a3a3a3' }} stroke="#444" />
                      <YAxis type="category" dataKey="country" width={60} tick={{ fontSize: 11, fill: '#a3a3a3' }} stroke="#444" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c1c1c',
                          border: '1px solid #444',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                          color: '#fafafa',
                        }}
                        labelStyle={{ color: '#a3a3a3' }}
                      />
                      <Bar dataKey="views" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Devices */}
            {deviceChart.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <MonitorSmartphone className="w-4 h-4 text-primary" /> Devices
                </h4>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceChart}
                        dataKey="views"
                        nameKey="device"
                        cx="50%"
                        cy="45%"
                        outerRadius={90}
                        innerRadius={45}
                        paddingAngle={2}
                        label={({ percent }: { percent?: number }) => {
                          if (!percent || percent < 0.05) return '';
                          return `${(percent * 100).toFixed(0)}%`;
                        }}
                        labelLine={false}
                      >
                        {deviceChart.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c1c1c',
                          border: '1px solid #444',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                          color: '#fafafa',
                        }}
                        formatter={(value?: number | string, name?: string) => [
                          Number(value ?? 0).toLocaleString(),
                          name ?? '',
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ color: '#a3a3a3', fontSize: 12, paddingTop: 12 }}
                        formatter={(value: string) => <span style={{ color: '#d4d4d4' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Traffic Sources */}
            {trafficChart.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" /> Traffic Sources
                </h4>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trafficChart}
                        dataKey="views"
                        nameKey="source"
                        cx="50%"
                        cy="45%"
                        outerRadius={90}
                        innerRadius={45}
                        paddingAngle={2}
                        label={({ percent }: { percent?: number }) => {
                          if (!percent || percent < 0.05) return '';
                          return `${(percent * 100).toFixed(0)}%`;
                        }}
                        labelLine={false}
                      >
                        {trafficChart.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c1c1c',
                          border: '1px solid #444',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                          color: '#fafafa',
                        }}
                        formatter={(value?: number | string, name?: string) => [
                          Number(value ?? 0).toLocaleString(),
                          name ?? '',
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ color: '#a3a3a3', fontSize: 11, paddingTop: 12 }}
                        formatter={(value: string) => <span style={{ color: '#d4d4d4' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
