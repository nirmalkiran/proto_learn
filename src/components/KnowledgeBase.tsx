import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Download } from "lucide-react";

const guides = [
  {
    title: "1Rivet - QA Engineering Guide",
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20QA%20Engineering%20Guide%20v1.0.pdf",
    description: "Comprehensive guide for QA engineering best practices and methodologies"
  },
  {
    title: "1Rivet - Performance Testing Guide", 
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20Performance%20Testing%20Guide%20v1.0.pdf",
    description: "Guidelines and strategies for effective performance testing"
  },
  {
    title: "1Rivet - API Testing Guide",
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20API%20Testing%20Guide%20v1.0.pdf", 
    description: "Best practices for API testing and validation"
  },
  {
    title: "1Rivet - Automation Testing Guide",
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20Automation%20Testing%20Guide%20v.1.0.pdf",
    description: "Framework and guidelines for test automation implementation"
  },
  {
    title: "1Rivet - Penetration Testing Guide", 
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20Penetration%20Testing%20Guide%20v1.0.pdf",
    description: "Security testing methodologies and penetration testing procedures"
  },
  {
    title: "1Rivet - Database Testing Guide",
    url: "https://1rivet.sharepoint.com/ISO/Shared%20Documents/Published%20Documents/Policies/1Rivet%20-%20Database%20Testing%20Guide%20v1.0.pdf",
    description: "Comprehensive approach to database testing and validation"
  }
];

const templates = [
  {
    title: "Test Plan Template",
    url: "https://1rivet.sharepoint.com/:w:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/Test%20Plan_v.2.1%20Latest.docx?d=w62286fa930014e5a8e88630c797dc3b4&csf=1&web=1&e=IoM0Fp",
    description: "Comprehensive test plan template for project testing documentation"
  },
  {
    title: "Test Strategy Template",
    url: "https://1rivet.sharepoint.com/:p:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/Test%20Strategy_v.2.0.pptx?d=wd6b0fd8302bd4cbc9cf566b305f3b504&csf=1&web=1&e=dXQ2QQ",
    description: "Strategic approach template for defining testing methodologies and scope"
  },
  {
    title: "Test Case Template",
    url: "https://1rivet.sharepoint.com/:x:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/Test%20Case%20Template_v.2.0.xlsx?d=w65d338bd16454049ab885772399a0cc9&csf=1&web=1&e=eJ6pNx",
    description: "Standardized template for creating detailed test cases and scenarios"
  },
  {
    title: "Defect Tracking Template",
    url: "https://1rivet.sharepoint.com/:x:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/Defect%20Tracking%20Template_v.2.0.xlsx?d=w5f4b57e8713741e6b980cd2dd10eb42b&csf=1&web=1&e=FiVfHg",
    description: "Template for tracking and managing defects throughout the testing lifecycle"
  },
  {
    title: "QA Status Report Template",
    url: "https://1rivet.sharepoint.com/:p:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/QA%20Status%20Report_v.2.0.pptx?d=w0beb8228b238421987546bd3448155f6&csf=1&web=1&e=WMHk1q",
    description: "Regular status reporting template for QA activities and progress tracking"
  },
  {
    title: "Test Closure Report Template",
    url: "https://1rivet.sharepoint.com/:w:/r/sites/QATeam2/Shared%20Documents/General/QA%20Documents%20-%202025/Templates/QA%20Templates/Test%20Closure%20Report_v.2.0.docx?d=wdba5c0e0aab9461685f00ec398a5a0a9&csf=1&web=1&e=x3ewwu",
    description: "Final report template summarizing test execution and closure activities"
  }
];

export const KnowledgeBase = () => {
  const handleDocumentAccess = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

const renderDocumentCards = (docs: typeof guides, sectionTitle: string) => (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <FileText className="h-6 w-6 text-primary" />
        {sectionTitle}
      </h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc, index) => (
          <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                    {doc.title}
                  </CardTitle>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg group-hover:bg-primary/10 transition-colors">
                  <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-sm mb-4 leading-relaxed">
                {doc.description}
              </CardDescription>
              <Button 
                onClick={() => handleDocumentAccess(doc.url)}
                className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <ExternalLink className="h-4 w-4" />
                Open Document
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Knowledge Base
          </h1>
          <p className="text-muted-foreground">
            Access testing documentation, guides, and templates from SharePoint
          </p>
        </div>
      </div>

      {renderDocumentCards(guides, "Testing Guides")}
      {renderDocumentCards(templates, "Testing Templates")}

      <Card className="bg-gradient-to-r from-muted/30 to-muted/10 border-dashed">
        <CardContent className="p-6 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
          <p className="text-muted-foreground text-sm">
            If you're having trouble accessing any documents, please contact your system administrator or check your SharePoint permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};