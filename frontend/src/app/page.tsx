'use client'
import Image from 'next/image'
import { useState } from 'react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
  '5:00 PM', '5:30 PM'
];


export default function Home() {
    const [grid, setGrid] = useState<boolean[][]>(() =>
        Array(5).fill(null).map(() => Array(20).fill(false))
    );
    const toggleSlot = (dayIndex: number, slotIndex: number) => {
        setGrid((prevGrid) => {
            const newGrid = prevGrid.map((dayRow) => [...dayRow]);
            newGrid[dayIndex][slotIndex] = !newGrid[dayIndex][slotIndex];
        return newGrid;
    });
    };
    return (
    <div className="flex flex-col items-center p-8 bg-zinc-50 dark:bg-zinc-900 min-h-screen text-zinc-900 dark:text-zinc-50">
        <h1 className="text-3xl font-bold mb-8">Weekly Availability Grid</h1>

        <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-md overflow-x-auto w-full max-w-4xl">
        <div className="grid grid-cols-6 gap-2 min-w-[600px] text-center font-semibold text-sm border-b pb-3 mb-3">
            <div>Time</div>
            {DAYS.map((day) => (
            <div key={day}>{day}</div>
            ))}
        </div>
        <div className="space-y-1">
            {TIME_SLOTS.map((time, slotIndex) => (
            <div key={time} className="grid grid-cols-6 gap-2 items-center min-w-[600px]">
                <div className="text-right pr-4 text-xs text-zinc-500 font-medium">{time}</div>
                {DAYS.map((day, dayIndex) => {
                const isAvailable = grid[dayIndex][slotIndex];

                return (
                    <button
                    key={`${dayIndex}-${slotIndex}`}
                    onClick={() => toggleSlot(dayIndex, slotIndex)}
                    className={`h-8 rounded-lg border transition-colors ${
                        isAvailable
                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm'
                        : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 dark:bg-zinc-700 dark:border-zinc-600'
                    }`}
                    title={`${day} at ${time}`}
                    />
                );
                })}
            </div>
            ))}
        </div>
        </div>
    </div>
    );
}
