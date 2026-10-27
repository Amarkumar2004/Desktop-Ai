import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionType, payload } = body;

    if (!actionType) {
      return NextResponse.json({ success: false, error: 'actionType is required' }, { status: 400 });
    }

    if (actionType === 'CREATE_FILE') {
      const filename = payload?.filename || `generated-${Date.now()}.txt`;
      const content = payload?.content || '// Created by SUSI Voice Assistant\n';

      // Safe workspace directory write
      const workspaceDir = process.cwd();
      const targetDir = path.join(workspaceDir, 'src', 'generated');

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const safePath = path.join(targetDir, path.basename(filename));
      fs.writeFileSync(safePath, content, 'utf8');

      return NextResponse.json({
        success: true,
        message: `File created at src/generated/${path.basename(filename)}`,
        filePath: safePath,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Action ${actionType} executed successfully.`,
      payload,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Action execution failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
