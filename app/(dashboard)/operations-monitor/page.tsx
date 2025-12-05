Real - time tracking of all active journeys and Papa movements
                    </p >
                </div >
            </div >

    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Live Journey Status
            </CardTitle>
            <CardDescription>
                Updates automatically in real-time as DOs report status changes
            </CardDescription>
        </CardHeader>
        <CardContent>
            <JourneyStatusTable />
        </CardContent>
    </Card>
        </div >
    )
}
