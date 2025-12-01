import React from 'react';
import { Assessment } from '../types';
import { Button } from '../components/Button';
import { Icons } from '../components/Icon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsProps {
  assessment: Assessment;
}

export const Analytics: React.FC<AnalyticsProps> = ({ assessment }) => {
  const gradedStudents = assessment.students.filter(s => s.status === 'GRADED');
  const maxScore = assessment.rubric.reduce((acc, r) => acc + r.maxPoints, 0);

  const downloadCSV = () => {
    // Header
    const questionHeaders = assessment.rubric.map(r => `"${r.question} (${r.maxPoints})"`).join(',');
    let csvContent = `data:text/csv;charset=utf-8,Student Name,Total Score,${questionHeaders},Comments\n`;

    // Rows
    assessment.students.forEach(student => {
      const qScores = assessment.rubric.map(r => student.grades[r.id]?.score || 0).join(',');
      const comments = assessment.rubric.map(r => `"${(student.grades[r.id]?.comment || '').replace(/"/g, '""')}"`).join(' | ');
      
      csvContent += `"${student.studentName}",${student.totalScore},${qScores},"${comments}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${assessment.title.replace(/\s+/g, '_')}_grades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Chart Data: Score Distribution
  const distributionData = [
    { name: '0-20%', count: 0 },
    { name: '21-40%', count: 0 },
    { name: '41-60%', count: 0 },
    { name: '61-80%', count: 0 },
    { name: '81-100%', count: 0 },
  ];

  gradedStudents.forEach(s => {
    const percentage = maxScore > 0 ? (s.totalScore / maxScore) * 100 : 0;
    if (percentage <= 20) distributionData[0].count++;
    else if (percentage <= 40) distributionData[1].count++;
    else if (percentage <= 60) distributionData[2].count++;
    else if (percentage <= 80) distributionData[3].count++;
    else distributionData[4].count++;
  });

  const averageScore = gradedStudents.length > 0
    ? (gradedStudents.reduce((acc, s) => acc + s.totalScore, 0) / gradedStudents.length).toFixed(1)
    : '0';

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Results & Export</h2>
           <p className="text-gray-500">Overview of student performance.</p>
        </div>
        <Button onClick={downloadCSV} variant="outline" className="gap-2">
          <Icons.Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 text-green-600 rounded-lg">
              <Icons.CheckCircle className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-gray-700">Graded</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{gradedStudents.length} <span className="text-sm font-normal text-gray-400">/ {assessment.students.length}</span></p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Icons.Analytics className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-gray-700">Average Score</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{averageScore} <span className="text-sm font-normal text-gray-400">/ {maxScore}</span></p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
               <Icons.Users className="w-5 h-5" />
             </div>
             <h3 className="font-semibold text-gray-700">Top Score</h3>
           </div>
           <p className="text-3xl font-bold text-gray-900">
             {Math.max(...gradedStudents.map(s => s.totalScore), 0)}
           </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-96">
        <h3 className="font-semibold text-gray-800 mb-6">Score Distribution</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distributionData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
            <Tooltip 
               cursor={{fill: '#f3f4f6'}}
               contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
            />
            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={50} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
