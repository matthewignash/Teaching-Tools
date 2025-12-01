import React, { useState } from 'react';
import { Assessment, AssessmentStatus, StudentSubmission } from './types';
import { RubricSetup } from './views/RubricSetup';
import { GradingView } from './views/GradingView';
import { Analytics } from './views/Analytics';
import { StudentSetup } from './views/StudentSetup';
import { Icons } from './components/Icon';
import { Button } from './components/Button';
import { FileUpload } from './components/FileUpload';

// Initial empty state
const initialAssessment: Assessment = {
  id: 'draft-1',
  title: 'Untitled Assessment',
  description: '',
  status: AssessmentStatus.DRAFT,
  rubric: [],
  students: [],
  cannedComments: [
    "Great work!",
    "Needs more detail here.",
    "Excellent analysis.",
    "Please show your calculations."
  ],
  created: Date.now()
};

const App: React.FC = () => {
  const [assessment, setAssessment] = useState<Assessment>(initialAssessment);
  const [currentView, setCurrentView] = useState<'SETUP' | 'STUDENTS' | 'GRADING' | 'RESULTS'>('SETUP');

  const renderContent = () => {
    switch (currentView) {
      case 'SETUP':
        return (
          <RubricSetup 
            assessment={assessment} 
            onUpdate={setAssessment} 
            onNext={() => setCurrentView('STUDENTS')} 
          />
        );
      
      case 'STUDENTS':
        return (
          <StudentSetup 
            assessment={assessment} 
            onUpdate={setAssessment} 
            onNext={() => setCurrentView('GRADING')}
            onBack={() => setCurrentView('SETUP')}
          />
        );

      case 'GRADING':
        return (
          <GradingView 
            assessment={assessment} 
            onUpdate={setAssessment} 
            onBack={() => setCurrentView('STUDENTS')}
          />
        );
      
      case 'RESULTS':
        return <Analytics assessment={assessment} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Icons.Brain className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              GradeMate AI
            </h1>
          </div>

          <nav className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {[
              { id: 'SETUP', label: 'Rubric', icon: Icons.Edit },
              { id: 'STUDENTS', label: 'Students', icon: Icons.Users },
              { id: 'GRADING', label: 'Grading', icon: Icons.CheckCircle },
              { id: 'RESULTS', label: 'Results', icon: Icons.Analytics }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                  ${currentView === tab.id 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                  }
                `}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;